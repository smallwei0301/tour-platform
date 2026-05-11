import { ok, fail } from '../../../../../../src/lib/api';
import { createClient } from '../../../../../../src/lib/supabase/server';

type TimelineItem = {
  at: string;
  type: string;
  source: string;
  title: string;
  detail?: Record<string, unknown>;
};

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  if (!orderId) {
    return Response.json(fail('VALIDATION_ERROR', 'orderId is required'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Find booking for this order
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, booking_no, status, order_id, activity_id, schedule_id, selected_date, qty, customer_name, customer_email, created_at, updated_at')
      .eq('order_id', orderId)
      .maybeSingle();

    if (bookingError) {
      return Response.json(fail('INTERNAL_ERROR', bookingError.message), { status: 500 });
    }

    const [paymentsRes, refundsRes, auditRes] = await Promise.all([
      supabase.from('payments').select('id, provider, trade_no, amount_twd, status, paid_at, created_at').eq('order_id', orderId).order('created_at', { ascending: true }),
      supabase.from('refund_requests').select('id, request_id, reason, note, status, requested_at, approved_at, refunded_at, admin_note').eq('order_id', orderId).order('requested_at', { ascending: true }),
      supabase.from('audit_logs').select('id, action, actor, metadata, created_at').eq('target_id', orderId).order('created_at', { ascending: true }),
    ]);

    const paymentIds = new Set((paymentsRes.data || []).map((p) => p.id));
    let paymentEvents: { id: string; payment_id: string; event_type: string; payload: unknown; created_at: string }[] = [];
    if (paymentIds.size > 0) {
      const { data: eventsData } = await supabase
        .from('payment_events')
        .select('id, payment_id, event_type, payload, created_at')
        .in('payment_id', [...paymentIds])
        .order('created_at', { ascending: true });
      paymentEvents = eventsData || [];
    }

    const timeline: TimelineItem[] = [];

    if (booking) {
      timeline.push({
        at: booking.created_at,
        type: 'booking_created',
        source: 'booking',
        title: 'Booking created',
        detail: { bookingId: booking.id, bookingNo: booking.booking_no, bookingStatus: booking.status },
      });
    }

    for (const p of paymentsRes.data || []) {
      timeline.push({
        at: p.paid_at || p.created_at,
        type: 'payment_recorded',
        source: 'payments',
        title: `${p.provider} payment ${p.status}`,
        detail: { paymentId: p.id, trade_no: p.trade_no, tradeNo: p.trade_no, amountTwd: p.amount_twd },
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
      if (r.approved_at) {
        timeline.push({
          at: r.approved_at,
          type: 'refund_approved',
          source: 'refund_requests',
          title: 'Refund approved',
          detail: { refundRequestId: r.id, adminNote: r.admin_note },
        });
      }
      if (r.refunded_at) {
        timeline.push({
          at: r.refunded_at,
          type: 'refund_complete',
          source: 'refund_requests',
          title: 'Refund completed',
          detail: { refundRequestId: r.id },
        });
      }
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

    return Response.json(ok({ timeline, bookingId: booking?.id || null }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(fail('INTERNAL_ERROR', message), { status: 500 });
  }
}
