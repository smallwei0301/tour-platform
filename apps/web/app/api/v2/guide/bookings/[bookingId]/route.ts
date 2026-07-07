/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/guide/bookings/[bookingId]）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
import { ok, fail } from '../../../../../../src/lib/api';
import { verifyGuideSession, maskEmail } from '../../../../../../src/lib/guide-auth';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../src/config/supabase-service-env.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
}

// Guide-safe conflict override fields — never expose adminNote/internal fields.
function extractGuideConflictOverride(snapshot: any): object | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    reason: snapshot.reason ?? null,
    requiresHelper: snapshot.requiresHelper ?? false,
    helperStatus: snapshot.helperStatus ?? null,
    guideNote: snapshot.guideNote ?? null,
    startAt: snapshot.startAt ?? null,
    endAt: snapshot.endAt ?? null,
    // adminNote is intentionally omitted — guide-facing only
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ bookingId: string }> },
) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const { bookingId } = await context.params;
  if (!bookingId) return Response.json(fail('BAD_REQUEST', 'bookingId required'), { status: 400 });

  const supabase = await getSupabase();

  // Fetch order
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id, contact_name, contact_email, contact_phone,
      people_count, status, total_twd, paid_at, created_at, admin_note,
      activity_id, schedule_id, booking_id,
      activity_schedules!orders_schedule_id_fkey(start_at, end_at, plan_id, capacity, booked_count)
    `)
    .eq('id', bookingId || '')
    .single();

  if (error || !order) {
    return Response.json(fail('NOT_FOUND', 'Order not found'), { status: 404 });
  }

  // Verify ownership: order.activity_id must belong to this guide
  const { data: activity } = await supabase
    .from('activities')
    .select('guide_id, title')
    .eq('id', order.activity_id)
    .single();

  if (!activity || activity.guide_id !== session.guideId) {
    return Response.json(fail('FORBIDDEN', '無權查看此訂單'), { status: 403 });
  }

  const schedule = Array.isArray(order.activity_schedules)
    ? order.activity_schedules[0]
    : order.activity_schedules;

  // Fetch conflict_override_snapshot from bookings table if booking_id is present.
  // Only guide-safe fields are forwarded; adminNote is stripped in extractGuideConflictOverride.
  let conflictOverride: object | null = null;
  if (order.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('conflict_override_snapshot')
      .eq('id', order.booking_id)
      .single();
    if (booking?.conflict_override_snapshot) {
      conflictOverride = extractGuideConflictOverride(booking.conflict_override_snapshot);
    }
  }

  return Response.json(ok({
    id: order.id,
    guestName: order.contact_name || '未知',
    guestPhone: order.contact_phone || '',  // Full phone for guide
    maskedEmail: order.contact_email ? maskEmail(order.contact_email) : '',
    partySize: order.people_count,
    status: order.status,
    totalTwd: order.total_twd,
    paymentStatus: order.paid_at ? 'paid' : 'unpaid',
    paidAt: order.paid_at,
    createdAt: order.created_at,
    adminNote: order.admin_note,
    tourTitle: activity.title,
    schedule: schedule ? {
      date: schedule.start_at,
      endAt: schedule.end_at,
      planId: schedule.plan_id,
      capacity: schedule.capacity,
      bookedCount: schedule.booked_count,
    } : null,
    conflictOverride,  // null when no conflict override; guide-safe fields only
  }));
}
