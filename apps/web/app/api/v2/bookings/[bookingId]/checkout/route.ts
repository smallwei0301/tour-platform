/**
 * POST /api/v2/bookings/:bookingId/checkout
 *
 * Checkout API (TP-BP-005)
 * Initiates payment for a draft booking.
 *
 * Request body:
 *   - provider (optional): Payment provider ('ecpay' default)
 *
 * Behavior:
 *   - booking must be 'draft' status
 *   - order must be 'pending_payment' status
 *   - creates payment record
 *   - creates payment_event (initiated)
 *   - returns payment session info
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../src/lib/api';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { generateCheckMacValue, getECPayCredentials } from '../../../../../../src/lib/ecpay';
import { findReusableCheckoutPayment } from '../../../../../../src/lib/checkout-idempotency';

// Validation helpers
function isValidUuid(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

const VALID_PROVIDERS = ['ecpay'] as const;
type PaymentProvider = (typeof VALID_PROVIDERS)[number];

type CheckoutBooking = {
  source_channel?: string | null;
  activities: { title: string } | null;
  activity_plans: { name: string } | null;
  [key: string]: unknown;
};


// ECPay configuration
const ECPAY_ENDPOINTS = {
  sandbox: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
  production: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
};

function getECPayEndpoint(): string {
  const env = process.env.ECPAY_ENV || 'sandbox';
  return ECPAY_ENDPOINTS[env as keyof typeof ECPAY_ENDPOINTS] || ECPAY_ENDPOINTS.sandbox;
}

function formatECPayDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function generateMerchantTradeNo(bookingId: string): string {
  // Format: First 12 chars of bookingId (without dashes) + 8 digit timestamp
  const idPart = bookingId.replace(/-/g, '').slice(0, 12);
  const timePart = Date.now().toString().slice(-8);
  return `${idPart}${timePart}`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await context.params;

  // Validate bookingId
  if (!bookingId || !isValidUuid(bookingId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid bookingId'), { status: 400 });
  }

  // Parse request body
  let body: { provider?: string } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // Empty body is OK, we'll use defaults
  }

  // Validate provider
  const provider: PaymentProvider =
    body.provider && VALID_PROVIDERS.includes(body.provider as PaymentProvider)
      ? (body.provider as PaymentProvider)
      : 'ecpay';

  try {
    const supabase = await createClient();

    // 1. Fetch booking and verify status
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(
        `
        id,
        booking_no,
        status,
        order_id,
        activity_id,
        activity_plan_id,
        source_channel,
        start_at,
        participants,
        activities (
          title
        ),
        activity_plans (
          name
        )
      `
      )
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return Response.json(errorV2('NOT_FOUND', 'Booking not found'), { status: 404 });
    }

    if (booking.status !== 'draft') {
      return Response.json(
        errorV2(
          'INVALID_STATE_TRANSITION',
          `Booking must be in draft status to checkout (current: ${booking.status})`
        ),
        { status: 400 }
      );
    }

    if (!booking.order_id) {
      return Response.json(errorV2('INTERNAL_ERROR', 'Booking has no associated order'), {
        status: 500,
      });
    }

    // 2. Fetch order and verify status
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_status, total_twd, contact_name, contact_email')
      .eq('id', booking.order_id)
      .single();

    if (orderError || !order) {
      return Response.json(errorV2('NOT_FOUND', 'Order not found'), { status: 404 });
    }

    if (order.status !== 'pending_payment') {
      return Response.json(
        errorV2(
          'INVALID_STATE_TRANSITION',
          `Order must be pending_payment to checkout (current: ${order.status})`
        ),
        { status: 400 }
      );
    }

    const checkoutBooking = booking as unknown as CheckoutBooking;
    const sourceChannel = checkoutBooking.source_channel || 'web';

    const { data: draftAuditLog } = await supabase
      .from('booking_status_logs')
      .select('metadata')
      .eq('booking_id', bookingId)
      .eq('to_status', 'draft')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const draftMetadata =
      draftAuditLog?.metadata && typeof draftAuditLog.metadata === 'object'
        ? (draftAuditLog.metadata as Record<string, unknown>)
        : null;

    const correlationId =
      (typeof draftMetadata?.correlationId === 'string' && draftMetadata.correlationId) ||
      request.headers.get('x-correlation-id')?.trim() ||
      `checkout-${bookingId}`;

    // 3. Reuse existing pending payment if available (idempotent checkout)
    const { data: existingPayments, error: existingPaymentError } = await supabase
      .from('payments')
      .select('id, trade_no, status')
      .eq('order_id', order.id)
      .eq('provider', provider)
      .order('created_at', { ascending: false })
      .limit(20);

    if (existingPaymentError) {
      console.error('Error checking existing payment:', existingPaymentError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to check existing payment'), {
        status: 500,
      });
    }

    const reusablePayment = findReusableCheckoutPayment(existingPayments);
    const shouldReusePayment = Boolean(reusablePayment);

    let paymentId: string | null = null;
    let merchantTradeNo: string;

    if (reusablePayment) {
      paymentId = reusablePayment.id;
      merchantTradeNo = reusablePayment.trade_no!;
    } else {
      // 4. Check ECPay credentials
      let hashKey: string;
      let hashIV: string;
      try {
        const credentials = getECPayCredentials();
        hashKey = credentials.hashKey;
        hashIV = credentials.hashIV;
      } catch (err) {
        console.error('ECPay credentials error:', err);
        return Response.json(errorV2('INTERNAL_ERROR', 'Payment provider not configured'), {
          status: 500,
        });
      }

      const merchantId = process.env.ECPAY_MERCHANT_ID;
      if (!merchantId) {
        return Response.json(errorV2('INTERNAL_ERROR', 'ECPAY_MERCHANT_ID not configured'), {
          status: 500,
        });
      }

      // 5. Generate merchant trade number
      merchantTradeNo = generateMerchantTradeNo(bookingId);

      // 6. Create payment record
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          order_id: order.id,
          provider: provider,
          trade_no: merchantTradeNo,
          amount_twd: order.total_twd,
          status: 'pending',
        })
        .select('id')
        .single();

      if (paymentError || !payment) {
        console.error('Error creating payment:', paymentError);
        return Response.json(errorV2('INTERNAL_ERROR', 'Failed to create payment'), {
          status: 500,
        });
      }

      paymentId = payment.id;

    }

    // 4b. Re-prepare credentials for payment params (shared path)
    let hashKey: string;
    let hashIV: string;
    try {
      const credentials = getECPayCredentials();
      hashKey = credentials.hashKey;
      hashIV = credentials.hashIV;
    } catch (err) {
      console.error('ECPay credentials error:', err);
      return Response.json(errorV2('INTERNAL_ERROR', 'Payment provider not configured'), {
        status: 500,
      });
    }

    const merchantId = process.env.ECPAY_MERCHANT_ID;
    if (!merchantId) {
      return Response.json(errorV2('INTERNAL_ERROR', 'ECPAY_MERCHANT_ID not configured'), {
        status: 500,
      });
    }

    if (!paymentId) {
      return Response.json(errorV2('INTERNAL_ERROR', 'Payment session is not available'), {
        status: 500,
      });
    }

    // 8. Build ECPay payment form parameters
    const activities = checkoutBooking.activities;
    const plans = checkoutBooking.activity_plans;
    const activityTitle = activities?.title || '行程預訂';
    const planName = plans?.name || '';
    const itemName = planName ? `${activityTitle} - ${planName}` : activityTitle;

    const callbackUrl =
      process.env.ECPAY_CALLBACK_URL ||
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/payments/ecpay/callback`;
    const returnUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/bookings/${bookingId}/success`;

    const now = new Date();
    const tradeDate = formatECPayDate(now);

    const ecpayParams: Record<string, string> = {
      MerchantID: merchantId,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: String(order.total_twd),
      TradeDesc: encodeURIComponent('Tour Platform 行程預訂'),
      ItemName: itemName.slice(0, 200), // ECPay has 200 char limit
      ReturnURL: callbackUrl,
      ClientBackURL: returnUrl,
      ChoosePayment: 'ALL',
      EncryptType: '1', // SHA256
      // V2 fields for tracking
      CustomField1: bookingId,
      CustomField2: order.id,
      CustomField3: paymentId,
      CustomField4: order.contact_email || '',
    };

    // Generate CheckMacValue
    const checkMacValue = generateCheckMacValue(ecpayParams, hashKey, hashIV);

    // 9. Build payment form HTML
    const formInputs = Object.entries({ ...ecpayParams, CheckMacValue: checkMacValue })
      .map(
        ([key, value]) =>
          `<input type="hidden" name="${key}" value="${value.replace(/"/g, '&quot;')}" />`
      )
      .join('\n');

    const paymentFormHtml = `
<form id="ecpay-form" method="POST" action="${getECPayEndpoint()}">
  ${formInputs}
</form>
<script>document.getElementById('ecpay-form').submit();</script>
`.trim();

    // 10. Create payment_event (initiated)
    await supabase.from('payment_events').insert({
      payment_id: paymentId,
      event_type: shouldReusePayment ? 'initiated_reused' : 'initiated',
      payload: {
        bookingId,
        orderId: order.id,
        merchantTradeNo,
        amount: order.total_twd,
        provider,
        sourceChannel,
        correlationId,
        auditSignal: 'line_liff_payment_init',
      },
    });

    // 11. Update booking status log
    await supabase.from('booking_status_logs').insert({
      booking_id: bookingId,
      from_status: 'draft',
      to_status: 'draft', // Status doesn't change yet
      actor_role: 'system',
      reason: 'Checkout initiated',
      metadata: {
        paymentId,
        merchantTradeNo,
        provider,
        sourceChannel,
        correlationId,
        auditSignal: 'line_liff_payment_init',
      },
    });

    // Return response per API spec
    return Response.json(
      successV2({
        provider,
        paymentId,
        merchantTradeNo,
        correlationId,
        sourceChannel,
        paymentFormHtml,
        // Also return raw params for clients that want to build their own form
        paymentParams: {
          endpoint: getECPayEndpoint(),
          params: { ...ecpayParams, CheckMacValue: checkMacValue },
        },
      })
    );
  } catch (err) {
    console.error('Checkout API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}
