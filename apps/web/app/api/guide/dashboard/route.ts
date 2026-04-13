import { ok, fail } from '../../../../src/lib/api'";
import { verifyGuideSession } from '../../../../src/lib/guide-auth'";

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({ monthlyBookings: 0, pendingBookings: [], upcomingSchedules: [] }));
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
    return Response.json(ok({ monthlyBookings: 0, pendingBookings: [], upcomingSchedules: [] }));
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

  // 3. Recent pending/confirmed bookings (last 5)
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('id, contact_name, people_count, status, created_at, schedule_id, activity_id')
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

  return Response.json(ok({
    monthlyBookings: monthlyBookings || 0,
    pendingBookings,
    upcomingSchedules,
  }));
}
