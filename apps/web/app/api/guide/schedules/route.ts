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
    return Response.json(ok([]));
  }

  const supabase = await getSupabase();

  // Get guide's activities
  const { data: activities } = await supabase
    .from('activities')
    .select('id, title, slug, plans')
    .eq('guide_id', session.guideId);

  const activityIds = (activities || []).map((a: any) => a.id);
  const activityMap = Object.fromEntries((activities || []).map((a: any) => [a.id, a]));

  if (activityIds.length === 0) return Response.json(ok([]));

  // Get all schedules
  const { data: schedules, error } = await supabase
    .from('activity_schedules')
    .select('id, activity_id, start_at, end_at, capacity, booked_count, status, plan_id, guide_note')
    .in('activity_id', activityIds)
    .order('start_at', { ascending: true });

  if (error) return Response.json(fail('SERVER_ERROR', error.message), { status: 500 });

  const result = (schedules || []).map((s: any) => {
    const act = activityMap[s.activity_id] || {};
    const plans = act.plans || [];
    const plan = plans.find((p: any) => p.id === s.plan_id);
    return {
      id: s.id,
      activityId: s.activity_id,
      tourTitle: act.title || '',
      tourSlug: act.slug || '',
      planId: s.plan_id,
      planName: plan?.label || s.plan_id || '預設方案',
      date: s.start_at,
      endAt: s.end_at,
      capacity: s.capacity,
      bookedCount: s.booked_count,
      status: s.status,
      guideNote: s.guide_note,
    };
  });

  return Response.json(ok(result));
}
