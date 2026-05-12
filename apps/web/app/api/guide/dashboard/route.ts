import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { computeExpectedPayout, computeNextPayoutDate } from '../../../../src/lib/settlement-config';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({
      monthlyBookings: 0,
      pendingBookings: [],
      upcomingSchedules: [],
      monthGmvTwd: 0,
      monthGmvOrderCount: 0,
      revenueTrend6m: [],
      expectedPayoutTwd: null,
      nextPayoutDate: null,
    }));
  }

  const supabase = await getSupabase();
  const guideId = session.guideId;

  // 1. Get guide's activity IDs
  const { data: activities } = await supabase
    .from('activities')
    .select('id, title, slug')
    .eq('guide_id', guideId);

  const activityIds = (activities || []).map((a: any) => a.id);
  const activityMap = Object.fromEntries((activities || []).map((a: any) => [a.id, a]));

  if (activityIds.length === 0) {
    return Response.json(ok({
      monthlyBookings: 0,
      pendingBookings: [],
      upcomingSchedules: [],
      monthGmvTwd: 0,
      monthGmvOrderCount: 0,
      revenueTrend6m: [],
      expectedPayoutTwd: null,
      nextPayoutDate: null,
    }));
  }

  // 2. Monthly bookings count (current month)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count: monthlyBookings } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .in('activity_id', activityIds)
    .gte('created_at', monthStart.toISOString());

  // 3. Recent pending/confirmed bookings (last 5), including total_twd for AC6
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('id, contact_name, people_count, status, created_at, schedule_id, activity_id, total_twd')
    .in('activity_id', activityIds)
    .order('created_at', { ascending: false })
    .limit(5);

  const pendingBookings = (recentOrders || []).map((o: any) => ({
    id: o.id,
    guestName: o.contact_name || '未知',
    partySize: o.people_count,
    status: o.status,
    createdAt: o.created_at,
    tourTitle: activityMap[o.activity_id]?.title || '',
    totalTwd: o.total_twd ?? 0,
  }));

  // 4. Upcoming schedules (next 7 days)
  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: schedules } = await supabase
    .from('activity_schedules')
    .select('id, activity_id, start_at, capacity, booked_count, status, plan_id')
    .in('activity_id', activityIds)
    .gte('start_at', now.toISOString())
    .lte('start_at', weekLater.toISOString())
    .order('start_at', { ascending: true })
    .limit(10);

  const upcomingSchedules = (schedules || []).map((s: any) => ({
    id: s.id,
    tourTitle: activityMap[s.activity_id]?.title || '',
    date: s.start_at,
    planId: s.plan_id,
    bookedCount: s.booked_count,
    maxCapacity: s.capacity,
    status: s.status,
  }));

  // 5. Monthly GMV (Asia/Taipei month boundary) — AC1, AC3
  const taipeiOffset = 8 * 60; // UTC+8 minutes
  const taipeiNow = new Date(now.getTime() + taipeiOffset * 60000);
  const gmvMonthStart = new Date(
    Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), 1) - taipeiOffset * 60000
  );
  const gmvMonthEnd = new Date(
    Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth() + 1, 1) - taipeiOffset * 60000
  );

  // AC3: only paid/confirmed/completed orders count toward GMV
  const gmvStatuses = ['paid', 'confirmed', 'completed'];

  const { data: monthOrders } = await supabase
    .from('orders')
    .select('total_twd, created_at')
    .in('activity_id', activityIds)
    .in('status', gmvStatuses)
    .gte('created_at', gmvMonthStart.toISOString())
    .lt('created_at', gmvMonthEnd.toISOString());

  const monthGmvTwd = (monthOrders ?? []).reduce((sum: number, o: any) => sum + (o.total_twd ?? 0), 0);
  const monthGmvOrderCount = (monthOrders ?? []).length;

  // 6. 6-month revenue trend — AC1
  const revenueTrend6m: Array<{ month: string; gmvTwd: number; orderCount: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(taipeiNow);
    d.setUTCMonth(d.getUTCMonth() - i);
    const mStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - taipeiOffset * 60000);
    const mEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - taipeiOffset * 60000);
    const { data: mOrders } = await supabase
      .from('orders')
      .select('total_twd')
      .in('activity_id', activityIds)
      .in('status', gmvStatuses)
      .gte('created_at', mStart.toISOString())
      .lt('created_at', mEnd.toISOString());
    revenueTrend6m.push({
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      gmvTwd: (mOrders ?? []).reduce((s: number, o: any) => s + (o.total_twd ?? 0), 0),
      orderCount: (mOrders ?? []).length,
    });
  }

  // 7. Draft v1 settlement: expectedPayout + nextPayoutDate
  // Query the most recent completed tour schedule for this guide
  const { data: latestScheduleRows } = await supabase
    .from('activity_schedules')
    .select('start_at')
    .in('activity_id', activityIds)
    .lt('start_at', now.toISOString())
    .order('start_at', { ascending: false })
    .limit(1);

  const latestCompletedTourDate =
    latestScheduleRows && latestScheduleRows.length > 0
      ? new Date((latestScheduleRows[0] as { start_at: string }).start_at)
      : null;

  const expectedPayoutTwd = computeExpectedPayout(monthGmvTwd);
  const nextPayoutDateObj = computeNextPayoutDate(latestCompletedTourDate);
  const nextPayoutDate = nextPayoutDateObj ? nextPayoutDateObj.toISOString().slice(0, 10) : null;

  return Response.json(ok({
    monthlyBookings: monthlyBookings || 0,
    pendingBookings,
    upcomingSchedules,
    monthGmvTwd,
    monthGmvOrderCount,
    revenueTrend6m,
    expectedPayoutTwd,
    nextPayoutDate,
  }));
}
