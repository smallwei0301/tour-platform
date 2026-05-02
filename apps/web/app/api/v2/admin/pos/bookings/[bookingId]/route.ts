import { successV2, errorV2 } from '../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../src/lib/supabase/server';

function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

type TimelineItem = {
  at: string;
  type: string;
  source: string;
  title: string;
  detail?: Record<string, unknown>;
};

export async function GET(_: Request, context: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await context.params;

  if (!bookingId || !isValidUuid(bookingId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid bookingId'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, booking_no, status, order_id, activity_id, schedule_id, selected_date, qty, customer_name, customer_email, created_at, updated_at')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return Response.json(errorV2('NOT_FOUND', 'Booking not found'), { status: 404 });
    }

    const orderId = booking.order_id;
    if (!orderId) {
      return Response.json(errorV2('INTERNAL_ERROR', 'Booking has no associated order'), { status: 500 });
    }

    const [orderRes, logsRes, paymentsRes, paymentEventsRes, refundsRes, auditRes] = await Promise.all([
      supabase.from('orders').select('id, order_no, status, payment_status, total_twd, created_at, updated_at').eq('id', orderId).single(),
      supabase.from('booking_status_logs').select('id, from_status, to_status, action, actor_role, actor_user_id, metadata, created_at').eq('booking_id', bookingId).order('created_at', { ascending: true }),
      supabase.from('payments').select('id, provider, trade_no, amount_twd, status, paid_at, created_at, raw_payload').eq('order_id', orderId).order('created_at', { ascending: true }),
      supabase.from('payment_events').select('id, payment_id, event_type, payload, created_at').order('created_at', { ascending: true }),
      supabase.from('refund_requests').select('id, request_id, reason, note, status, requested_at, approved_at, refunded_at, admin_note').eq('order_id', orderId).order('requested_at', { ascending: true }),
      supabase.from('audit_logs').select('id, action, actor, metadata, created_at').eq('target_id', orderId).order('created_at', { ascending: true }),
    ]);

    if (orderRes.error || !orderRes.data) {
      return Response.json(errorV2('NOT_FOUND', 'Order not found'), { status: 404 });
    }

    const paymentIds = new Set((paymentsRes.data || []).map((p) => p.id));
    const paymentEvents = (paymentEventsRes.data || []).filter((e) => paymentIds.has(e.payment_id));

    const timeline: TimelineItem[] = [];

    timeline.push({
      at: booking.created_at,
      type: 'booking_created',
      source: 'booking',
      title: 'Booking created',
      detail: { bookingStatus: booking.status },
    });

    for (const row of logsRes.data || []) {
      timeline.push({
        at: row.created_at,
        type: 'booking_status_changed',
        source: 'booking_status_logs',
        title: `${row.from_status || 'unknown'} → ${row.to_status || 'unknown'}`,
        detail: {
          action: row.action,
          actorRole: row.actor_role,
          actorUserId: row.actor_user_id,
          metadata: row.metadata || {},
        },
      });
    }

    for (const p of paymentsRes.data || []) {
      timeline.push({
        at: p.paid_at || p.created_at,
        type: 'payment_recorded',
        source: 'payments',
        title: `${p.provider} payment ${p.status}`,
        detail: { paymentId: p.id, tradeNo: p.trade_no, amountTwd: p.amount_twd, rawPayload: p.raw_payload || {} },
      });
    }

    for (const e of paymentEvents) {
      timeline.push({
        at: e.created_at,
        type: `payment_event_${e.event_type}`,
        source: 'payment_events',
        title: `Payment event: ${e.event_type}`,
        detail: { paymentId: e.payment_id, payload: e.payload || {} },
      });
    }

    for (const r of refundsRes.data || []) {
      timeline.push({
        at: r.requested_at,
        type: 'refund_requested',
        source: 'refund_requests',
        title: `Refund ${r.status}`,
        detail: {
          refundRequestId: r.id,
          requestId: r.request_id,
          reason: r.reason,
          note: r.note,
          approvedAt: r.approved_at,
          refundedAt: r.refunded_at,
          adminNote: r.admin_note,
        },
      });
    }

    for (const a of auditRes.data || []) {
      if (!String(a.action || '').startsWith('refund_') && !String(a.action || '').startsWith('order_')) continue;
      timeline.push({
        at: a.created_at,
        type: `audit_${a.action}`,
        source: 'audit_logs',
        title: `Audit: ${a.action}`,
        detail: { actor: a.actor, metadata: a.metadata || {} },
      });
    }

    timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return Response.json(successV2({
      booking: {
        id: booking.id,
        bookingNo: booking.booking_no,
        status: booking.status,
        activityId: booking.activity_id,
        scheduleId: booking.schedule_id,
        selectedDate: booking.selected_date,
        qty: booking.qty,
        customerName: booking.customer_name,
        customerEmail: booking.customer_email,
        createdAt: booking.created_at,
        updatedAt: booking.updated_at,
      },
      order: {
        id: orderRes.data.id,
        orderNo: orderRes.data.order_no,
        status: orderRes.data.status,
        paymentStatus: orderRes.data.payment_status,
        totalTwd: orderRes.data.total_twd,
        createdAt: orderRes.data.created_at,
        updatedAt: orderRes.data.updated_at,
      },
      timeline,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(errorV2('INTERNAL_ERROR', message), { status: 500 });
  }
}
