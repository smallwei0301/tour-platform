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
import { handleRouteError } from '../../../../../../src/lib/route-error';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { generateCheckMacValue, getECPayCredentials } from '../../../../../../src/lib/ecpay';
import { findReusableCheckoutPayment } from '../../../../../../src/lib/checkout-idempotency';
import { isTransferPaymentEnabled } from '../../../../../../src/config/feature-flags.mjs';
import { canCheckout } from '../../../../../../src/lib/booking-type-flow.mjs';
import { isPaymentExpired } from '../../../../../../src/lib/payment-deadline.mjs';
import { selectWithOptionalColumnFallback } from '../../../../../../src/lib/optional-column-fallback.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../src/config/supabase-service-env.mjs';

// Validation helpers
function isValidUuid(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// 'transfer' = 自行匯款（手動查帳，#1475）：不走線上金流，建立 pending 付款記錄後等待後台人工核帳。
const VALID_PROVIDERS = ['ecpay', 'transfer'] as const;
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

  // 匯款付款需 feature flag 開啟（#1475）
  if (provider === 'transfer' && !isTransferPaymentEnabled()) {
    return Response.json(errorV2('VALIDATION_ERROR', '匯款付款目前未開放'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Service-role client for privileged payment tables.
    // `payments` / `payment_events` had their anon/authenticated grants revoked
    // in issue #614 (migration 20260519120000) and are now service_role-only.
    // The anon SSR `supabase` client above stays in charge of traveler-scoped
    // authorization (RLS on bookings/orders); payment-table reads/writes must go
    // through `paymentDb` or Postgres returns "permission denied for table payments".
    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const paymentDb = createServiceClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!
    );

    // 1. Fetch booking and verify status
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(
        `
        id,
        booking_no,
        status,
        guide_approval_status,
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
          name,
          booking_type
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

    // 三種預約模式：request plan 須導遊審核通過才能進付款（先審核後付款）。
    {
      const planRel = (booking as { activity_plans?: { booking_type?: string } | { booking_type?: string }[] }).activity_plans;
      const planBookingType = Array.isArray(planRel) ? planRel[0]?.booking_type : planRel?.booking_type;
      const approvalStatus = (booking as { guide_approval_status?: string }).guide_approval_status;
      const gate = canCheckout(planBookingType, approvalStatus);
      if (!gate.allowed) {
        return Response.json(errorV2(gate.code, gate.messageZh), { status: 409 });
      }
    }

    if (!booking.order_id) {
      return Response.json(errorV2('INTERNAL_ERROR', 'Booking has no associated order'), {
        status: 500,
      });
    }

    // 2. Fetch order and verify status
    // #1493 部署順序安全：payment_deadline_at 萬一還沒套到正式 DB，退到不含該欄位的
    // select（缺欄位時視為無期限、不擋結帳），避免付款流程整個 500。
    const { data: order, error: orderError } = await selectWithOptionalColumnFallback(
      (sel: string) => supabase.from('orders').select(sel).eq('id', booking.order_id as string).single(),
      [
        'id, status, payment_status, total_twd, contact_name, contact_email, payment_deadline_at',
        'id, status, payment_status, total_twd, contact_name, contact_email',
      ],
    );

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

    // #1493 惰性守門：已過付款期限者擋下結帳（sweep 兜底取消，這裡即時阻擋）。
    if (
      isPaymentExpired(
        (order as { payment_deadline_at?: string | null }).payment_deadline_at ?? null,
        new Date().toISOString(),
      )
    ) {
      return Response.json(
        errorV2('PAYMENT_DEADLINE_PASSED', '付款期限已過，此訂單已逾時，請重新預約'),
        { status: 409 },
      );
    }

    const checkoutBooking = booking as unknown as CheckoutBooking;
    const sourceChannel = checkoutBooking.source_channel || 'web';

    // Soft-launch guard
    {
      const { getControls, isWhitelisted } = await import('../../../../../../src/lib/soft-launch.mjs');
      const svc = paymentDb;
      const controls = await getControls(svc);
      if (controls.new_booking_paused) {
        const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
        const userId = user?.id;
        const allowed = controls.whitelist_enabled ? await isWhitelisted(svc, { userId, activityId: undefined, guideId: undefined }) : false;
        if (!allowed) {
          return Response.json(errorV2('BOOKING_PAUSED', '目前暫停接受新訂單，請稍後再試'), { status: 423 });
        }
      }
    }

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

    // ── 匯款（手動查帳）分支（#1475）──────────────────────────────
    // 不走 ECPay：建立／重用一筆 provider='transfer'、status='pending' 的付款記錄，
    // order 維持 pending_payment、booking 維持 draft，等待後台以既有 manual-payment
    // API 人工核帳後才轉 paid / pending_confirmation。回傳不含 paymentFormHtml。
    if (provider === 'transfer') {
      // payments / payment_events 為 service_role-only（#614），必須走 paymentDb。
      const { data: existingTransfers } = await paymentDb
        .from('payments')
        .select('id, trade_no, status')
        .eq('order_id', order.id)
        .eq('provider', 'transfer')
        .order('created_at', { ascending: false })
        .limit(20);
      const reusableTransfer = findReusableCheckoutPayment(existingTransfers);

      let transferPaymentId: string | null = reusableTransfer?.id ?? null;
      const transferTradeNo = reusableTransfer?.trade_no ?? generateMerchantTradeNo(bookingId);

      if (!transferPaymentId) {
        const { data: tp, error: tpErr } = await paymentDb
          .from('payments')
          .insert({
            order_id: order.id,
            provider: 'transfer',
            trade_no: transferTradeNo,
            amount_twd: order.total_twd,
            status: 'pending',
          })
          .select('id')
          .single();
        if (tpErr || !tp) {
          console.error('Error creating transfer payment:', tpErr);
          return Response.json(errorV2('INTERNAL_ERROR', 'Failed to create transfer payment'), {
            status: 500,
          });
        }
        transferPaymentId = tp.id;
      }

      await paymentDb.from('payment_events').insert({
        payment_id: transferPaymentId,
        event_type: reusableTransfer ? 'initiated_reused' : 'initiated',
        payload: {
          bookingId,
          orderId: order.id,
          merchantTradeNo: transferTradeNo,
          amount: order.total_twd,
          provider: 'transfer',
          sourceChannel,
          correlationId,
          auditSignal: 'transfer_payment_init',
        },
      });

      await supabase.from('booking_status_logs').insert({
        booking_id: bookingId,
        from_status: 'draft',
        to_status: 'draft',
        actor_role: 'system',
        reason: 'Transfer checkout initiated (awaiting manual reconciliation)',
        metadata: {
          paymentId: transferPaymentId,
          merchantTradeNo: transferTradeNo,
          provider: 'transfer',
          sourceChannel,
          correlationId,
          auditSignal: 'transfer_payment_init',
        },
      });

      return Response.json(
        successV2({
          provider: 'transfer',
          paymentId: transferPaymentId,
          merchantTradeNo: transferTradeNo,
          correlationId,
          sourceChannel,
          paymentFormHtml: null,
          awaitingManualPayment: true,
        })
      );
    }

    // 3. Reuse existing pending payment if available (idempotent checkout)
    const { data: existingPayments, error: existingPaymentError } = await paymentDb
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
      const merchantId = process.env.ECPAY_MERCHANT_ID;
      if (!merchantId) {
        return Response.json(errorV2('INTERNAL_ERROR', 'ECPAY_MERCHANT_ID not configured'), {
          status: 500,
        });
      }

      // 5. Generate merchant trade number
      merchantTradeNo = generateMerchantTradeNo(bookingId);

      // 6. Create payment record
      const { data: payment, error: paymentError } = await paymentDb
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
      TradeDesc: encodeURIComponent('Midao 祕島 行程預訂'),
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
    await paymentDb.from('payment_events').insert({
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
    return handleRouteError(err, { route: 'v2/bookings/checkout' });
  }
}
