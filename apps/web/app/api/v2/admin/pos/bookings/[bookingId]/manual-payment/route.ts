import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../../src/lib/supabase/server';
import { updateAdminOrderDb } from '../../../../../../../../src/lib/db.mjs';
import { BookingStateService } from '../../../../../../../../src/lib/booking-state';

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
    const supabase = await createClient();

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

    if (order.status !== 'pending_payment') {
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

    const paidAt = new Date().toISOString();
    const tradeNo = buildManualTradeNo(bookingId);

    const { data: payment, error: paymentError } = await supabase
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

    await supabase.from('payment_events').insert({
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

    const bookingStateService = new BookingStateService(supabase as any);
    const transition = await bookingStateService.paymentReceived(bookingId, {
      actorUserId: body.adminUserId || null,
      actorRole: 'admin',
      reason: 'Manual payment received via Admin POS',
      metadata: {
        sourceChannel: 'admin_pos',
        paymentId: payment.id,
        tradeNo,
      },
    });

    if (!transition.success) {
      return Response.json(
        errorV2(transition.error?.code || 'INVALID_STATE_TRANSITION', transition.error?.message || 'Booking state transition failed'),
        { status: 400 }
      );
    }

    const updatedOrder = await updateAdminOrderDb({
      orderId: order.id,
      status: 'paid',
      actor: 'admin',
      sourceChannel: 'admin_pos',
      bookingId,
      paymentId: payment.id,
      adminNote: body.note || undefined,
    });

    return Response.json(
      successV2({
        bookingId,
        bookingNo: booking.booking_no,
        bookingStatus: transition.booking?.status || 'pending_confirmation',
        orderId: updatedOrder.id,
        orderStatus: updatedOrder.status,
        paymentStatus: 'paid',
        paymentId: payment.id,
        amountTwd,
        paidAt,
      })
    );
  } catch (err) {
    console.error('Admin POS manual payment API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}
