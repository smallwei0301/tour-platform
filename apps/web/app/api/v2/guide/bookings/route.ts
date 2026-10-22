/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/guide/bookings）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession, maskEmail } from '../../../../../src/lib/guide-auth';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!getSupabaseUrl()) return Response.json(ok([]));

  const supabase = await getSupabase();

  // Get guide's activities
  const { data: activities } = await supabase
    .from('activities')
    .select('id, title')
    .eq('guide_id', session.guideId);

  const activityIds = (activities || []).map((a: any) => a.id);
  const activityIdSet = new Set<string>(activityIds);
  const activityMap = Object.fromEntries((activities || []).map((a: any) => [a.id, a]));

  if (activityIds.length === 0) return Response.json(ok([]));

  // Optional: filter by scheduleId
  const url = new URL(req.url);
  const filterScheduleId = url.searchParams.get('scheduleId');

  // Get orders with schedule info and booking_id for conflict override lookup
  let query = supabase
    .from('orders')
    .select(`
      id, contact_name, contact_email, contact_phone,
      people_count, status, total_twd, paid_at, created_at, admin_note,
      activity_id, schedule_id, booking_id,
      activity_schedules!orders_schedule_id_fkey(start_at, plan_id)
    `)
    .in('activity_id', activityIds)
    .order('created_at', { ascending: false })
    .limit(100);

  if (filterScheduleId) {
    query = query.eq('schedule_id', filterScheduleId);
  }

  const { data: orders, error } = await query;

  if (error) return Response.json(fail('SERVER_ERROR', error.message), { status: 500 });

  // Fetch conflict_override_snapshot for orders that have a booking_id
  const bookingIds = (orders || [])
    .map((o: any) => o.booking_id)
    .filter((id: any) => Boolean(id));

  // Build maps keyed by booking_id: hasConflictOverride (compact marker) and activity_plan_id
  const conflictOverrideMap: Record<string, boolean> = {};
  const bookingPlanIdMap: Record<string, string> = {};
  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, conflict_override_snapshot, activity_plan_id')
      .in('id', bookingIds);
    for (const booking of bookings || []) {
      if (booking.conflict_override_snapshot) {
        conflictOverrideMap[booking.id] = true;
      }
      if (booking.activity_plan_id) {
        bookingPlanIdMap[booking.id] = booking.activity_plan_id;
      }
    }
  }

  // planId 優先取 bookings.activity_plan_id，其次 schedule.plan_id；名稱只採用屬於本導遊 activity 的 plan
  const resolvePlanId = (o: any): string | null => {
    const schedule = Array.isArray(o.activity_schedules) ? o.activity_schedules[0] : o.activity_schedules;
    return (o.booking_id ? bookingPlanIdMap[o.booking_id] : undefined) ?? schedule?.plan_id ?? null;
  };
  const planIds = Array.from(new Set((orders || []).map(resolvePlanId).filter((id: any): id is string => Boolean(id))));
  const planMap: Record<string, { name: string | null; activity_id: string }> = {};
  if (planIds.length > 0) {
    const { data: plans } = await supabase
      .from('activity_plans')
      .select('id, name, activity_id')
      .in('id', planIds);
    for (const plan of plans || []) {
      if (activityIdSet.has(plan.activity_id)) {
        planMap[plan.id] = { name: plan.name ?? null, activity_id: plan.activity_id };
      }
    }
  }

  const result = (orders || []).map((o: any) => {
    const schedule = Array.isArray(o.activity_schedules) ? o.activity_schedules[0] : o.activity_schedules;
    const planId = resolvePlanId(o);
    const plan = planId ? planMap[planId] : undefined;
    return {
      id: o.id,
      scheduleId: o.schedule_id,
      guestName: o.contact_name || '未知',
      guestPhone: filterScheduleId ? (o.contact_phone || '') : '',  // show phone only when filtering by schedule
      maskedEmail: o.contact_email ? maskEmail(o.contact_email) : '',
      scheduleDate: schedule?.start_at || null,
      planId,
      planName: plan && plan.activity_id === o.activity_id ? (plan.name || null) : null,
      tourTitle: activityMap[o.activity_id]?.title || '',
      partySize: o.people_count,
      status: o.status,
      paymentStatus: o.paid_at ? 'paid' : 'unpaid',
      totalTwd: o.total_twd,
      createdAt: o.created_at,
      hasConflictOverride: o.booking_id ? (conflictOverrideMap[o.booking_id] ?? false) : false,
    };
  });

  return Response.json(ok(result));
}
