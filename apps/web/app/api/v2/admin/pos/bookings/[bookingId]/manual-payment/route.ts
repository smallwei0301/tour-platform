import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../../src/lib/api';
import { handleRouteError } from '../../../../../../../../src/lib/route-error';
import { updateAdminOrderDb } from '../../../../../../../../src/lib/db.mjs';
import { BookingStateService } from '../../../../../../../../src/lib/booking-state';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../../../src/config/supabase-service-env.mjs';

function isValidUuid(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function buildManualTradeNo(bookingId: string): string {
  return `MANUAL-${bookingId.replace(/-/g, '').slice(0, 12)}-${Date.now().toString().slice(-8)}`;
}

interface ManualPaymentRequest {
  amountTwd?: number;
  note?: string;
  adminUserId?: string;
}

interface ExistingPayment {
  id: string;
  provider: string;
  status: string;
  trade_no?: string | null;
  merchant_trade_no?: string | null;
  amount_twd?: number | null;
  paid_at?: string | null;
  raw_payload?: unknown;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await context.params;

  if (!bookingId || !isValidUuid(bookingId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid bookingId'), { status: 400 });
  }

  let body: ManualPaymentRequest = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    // Admin middleware authenticates the operator separately from Supabase
    // traveler sessions. Use the service-role client for every read/write here:
    // payments/payment_events are service-role-only and admin cookies are not a
    // Supabase traveler session.
    const supabase = createServiceClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!
    );
    const paymentDb = supabase;

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, booking_no, status, order_id')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return Response.json(errorV2('NOT_FOUND', 'Booking not found'), { status: 404 });
    }

    if (!booking.order_id) {
      return Response.json(errorV2('INTERNAL_ERROR', 'Booking has no associated order'), {
        status: 500,
      });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_status, total_twd')
      .eq('id', booking.order_id)
      .single();

    if (orderError || !order) {
      return Response.json(errorV2('NOT_FOUND', 'Order not found'), { status: 404 });
    }

    const { data: orderPayments, error: paymentLookupError } = await paymentDb
      .from('payments')
      .select('id, provider, status, trade_no, merchant_trade_no, amount_twd, paid_at, raw_payload')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (paymentLookupError) {
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to inspect order payments'), { status: 500 });
    }

    const payments = (orderPayments || []) as ExistingPayment[];
    const transferPayments = payments.filter((p: ExistingPayment) => p.provider === 'transfer');
    if (payments.length > 1 || transferPayments.length > 1) {
      return Response.json(errorV2('INVALID_STATE_TRANSITION', 'Order has ambiguous payment records; reconcile manually before retrying'), {
        status: 409,
      });
    }
    const transferPayment = transferPayments[0];

    if (booking.status !== 'draft' && booking.status !== 'pending_confirmation') {
      return Response.json(errorV2('INVALID_STATE_TRANSITION', `Booking must be draft or pending_confirmation (current: ${booking.status})`), { status: 409 });
    }

    // A retried request after a completed reconciliation is safe and does not
    // create another payment row.
    if (order.status !== 'pending_payment') {
      if (order.status === 'paid' && order.payment_status === 'paid' && transferPayment?.status === 'paid') {
        return Response.json(successV2({
          bookingId,
          bookingNo: booking.booking_no,
          bookingStatus: booking.status,
          orderId: order.id,
          orderStatus: order.status,
          paymentStatus: order.payment_status,
          paymentId: transferPayment.id,
          amountTwd: Number(transferPayment.amount_twd),
          paidAt: transferPayment.paid_at,
          replayedRequest: true,
        }));
      }
      return Response.json(
        errorV2(
          'INVALID_STATE_TRANSITION',
          `Order must be pending_payment for manual payment (current: ${order.status})`
        ),
        { status: 400 }
      );
    }

    const amountTwd =
      body.amountTwd == null
        ? Number(order.total_twd)
        : Number.isFinite(body.amountTwd)
          ? Number(body.amountTwd)
          : NaN;

    if (!Number.isInteger(amountTwd) || amountTwd < 0) {
      return Response.json(errorV2('VALIDATION_ERROR', 'amountTwd must be a non-negative integer'), {
        status: 400,
      });
    }

    if (transferPayment && amountTwd !== Number(order.total_twd)) {
      return Response.json(errorV2('VALIDATION_ERROR', 'amountTwd must match order total for transfer reconciliation'), {
        status: 400,
      });
    }
    if (transferPayment && Number(transferPayment.amount_twd) !== Number(order.total_twd)) {
      return Response.json(errorV2('INVALID_STATE_TRANSITION', 'Transfer payment amount does not match order total'), {
        status: 409,
      });
    }

    // A direct Admin POS cash/manual payment is allowed only when checkout has
    // not already created another payment. For a transfer checkout, reconcile
    // the existing transfer row because payments.order_id is unique.
    if (!transferPayment && payments.length > 0) {
      return Response.json(errorV2('INVALID_STATE_TRANSITION', 'Order already has a payment; use its provider reconciliation path'), {
        status: 409,
      });
    }

    const paidAt = new Date().toISOString();
    let paymentId: string;
    let tradeNo: string | null = null;
    let paymentPaidAt = paidAt;
    let eventType = 'provider_reconciled_paid';
    let replayedPayment = false;

    if (transferPayment) {
      const previousPayload =
        transferPayment.raw_payload && typeof transferPayment.raw_payload === 'object' && !Array.isArray(transferPayment.raw_payload)
          ? transferPayment.raw_payload as Record<string, unknown>
          : {};

      if (transferPayment.status === 'paid') {
        paymentId = transferPayment.id;
        tradeNo = transferPayment.trade_no || transferPayment.merchant_trade_no || null;
        paymentPaidAt = transferPayment.paid_at || paidAt;
        replayedPayment = true;
      } else if (transferPayment.status === 'pending') {
        const { data: updatedTransfer, error: updateTransferError } = await paymentDb
          .from('payments')
          .update({
            status: 'paid',
            paid_at: paidAt,
            raw_payload: {
              ...previousPayload,
              channel: 'admin_pos',
              note: body.note || null,
            },
          })
          .eq('id', transferPayment.id)
          .eq('status', 'pending')
          .select('id, trade_no, merchant_trade_no, paid_at, status')
          .maybeSingle();

        if (updateTransferError) {
          console.error('Transfer payment reconciliation failed:', updateTransferError);
          return Response.json(errorV2('INTERNAL_ERROR', 'Failed to reconcile transfer payment'), { status: 500 });
        }

        if (updatedTransfer) {
          paymentId = updatedTransfer.id;
          tradeNo = updatedTransfer.trade_no || updatedTransfer.merchant_trade_no || null;
          paymentPaidAt = updatedTransfer.paid_at || paidAt;
        } else {
          // Another operator may have won the compare-and-set update. Re-read
          // and accept only the paid terminal state.
          const { data: currentTransfer, error: currentTransferError } = await paymentDb
            .from('payments')
            .select('id, trade_no, merchant_trade_no, paid_at, status')
            .eq('id', transferPayment.id)
            .maybeSingle();
          if (currentTransferError || !currentTransfer || currentTransfer.status !== 'paid') {
            return Response.json(errorV2('INVALID_STATE_TRANSITION', 'Transfer payment changed during reconciliation'), { status: 409 });
          }
          paymentId = currentTransfer.id;
          tradeNo = currentTransfer.trade_no || currentTransfer.merchant_trade_no || null;
          paymentPaidAt = currentTransfer.paid_at || paidAt;
          replayedPayment = true;
        }
        eventType = 'provider_reconciled_paid';
      } else {
        return Response.json(errorV2('INVALID_STATE_TRANSITION', `Transfer payment is not pending (current: ${transferPayment.status})`), { status: 409 });
      }

      // The event has a uniqueness guard in the payment domain migration. A
      // duplicate insert is harmless; other errors remain visible.
      const { error: eventError } = await paymentDb.from('payment_events').insert({
        payment_id: paymentId,
        order_id: order.id,
        provider: 'transfer',
        event_type: eventType,
        merchant_trade_no: transferPayment.merchant_trade_no || null,
        trade_no: transferPayment.trade_no || null,
        payload: {
          bookingId,
          orderId: order.id,
          paymentId,
          sourceChannel: 'admin_pos',
          note: body.note || null,
          reconciledAt: paymentPaidAt,
        },
      });
      if (eventError && eventError.code !== '23505') {
        return Response.json(errorV2('INTERNAL_ERROR', 'Failed to record transfer reconciliation'), { status: 500 });
      }
    } else {
      tradeNo = buildManualTradeNo(bookingId);
      const { data: payment, error: paymentError } = await paymentDb
        .from('payments')
        .insert({
          order_id: order.id,
          provider: 'manual',
          trade_no: tradeNo,
          amount_twd: amountTwd,
          status: 'paid',
          paid_at: paidAt,
          raw_payload: {
            channel: 'admin_pos',
            note: body.note || null,
          },
        })
        .select('id')
        .single();

      if (paymentError || !payment) {
        console.error('Manual payment insert failed:', paymentError);
        return Response.json(errorV2('INTERNAL_ERROR', 'Failed to create manual payment'), {
          status: 500,
        });
      }
      paymentId = payment.id;

      const { error: eventError } = await paymentDb.from('payment_events').insert({
        payment_id: payment.id,
        event_type: 'paid',
        payload: {
          bookingId,
          orderId: order.id,
          paymentId: payment.id,
          sourceChannel: 'admin_pos',
          note: body.note || null,
        },
      });
      if (eventError) {
        return Response.json(errorV2('INTERNAL_ERROR', 'Failed to record manual payment event'), { status: 500 });
      }
    }

    let bookingStatus = booking.status;
    if (booking.status === 'draft') {
      const bookingStateService = new BookingStateService(supabase as any);
      const transition = await bookingStateService.paymentReceived(bookingId, {
        actorUserId: body.adminUserId || null,
        actorRole: 'admin',
        reason: 'Manual payment received via Admin POS',
        metadata: {
          sourceChannel: 'admin_pos',
          paymentId,
          tradeNo,
        },
      });

      if (!transition.success) {
        const { data: latestBooking } = await supabase
          .from('bookings')
          .select('status')
          .eq('id', bookingId)
          .maybeSingle();
        if (latestBooking?.status !== 'pending_confirmation') {
          return Response.json(
            errorV2(transition.error?.code || 'INVALID_STATE_TRANSITION', transition.error?.message || 'Booking state transition failed'),
            { status: 400 }
          );
        }
        bookingStatus = latestBooking.status;
      } else {
        bookingStatus = transition.booking?.status || 'pending_confirmation';
      }
    }

    const updatedOrder = await updateAdminOrderDb({
      orderId: order.id,
      status: 'paid',
      actor: 'admin',
      sourceChannel: 'admin_pos',
      bookingId,
      paymentId,
      adminNote: body.note || undefined,
    });

    return Response.json(
      successV2({
        bookingId,
        bookingNo: booking.booking_no,
        bookingStatus,
        orderId: updatedOrder.id,
        orderStatus: updatedOrder.status,
        paymentStatus: 'paid',
        paymentId,
        amountTwd,
        paidAt: paymentPaidAt,
        replayedRequest: replayedPayment,
      })
    );
  } catch (err) {
    return handleRouteError(err, { route: 'v2/admin/pos/bookings/manual-payment' });
  }
}
