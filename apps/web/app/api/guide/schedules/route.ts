import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../src/config/supabase-service-env.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!getSupabaseUrl()) {
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

  // 取出各場次的「外部佔位」（external_hold）以便後台呈現與釋放。
  // booked_count 已含外部佔位；這裡額外帶出明細，讓導遊看得到「其中 N 為外部佔位」。
  const scheduleIds = (schedules || []).map((s: any) => s.id);
  const holdsBySchedule: Record<string, Array<{ id: string; participants: number; note: string | null }>> = {};
  if (scheduleIds.length > 0) {
    const { data: holds } = await supabase
      .from('bookings')
      .select('id, schedule_id, participants, internal_note')
      .eq('status', 'external_hold')
      .in('schedule_id', scheduleIds);
    for (const h of holds || []) {
      if (!h.schedule_id) continue;
      (holdsBySchedule[h.schedule_id] ||= []).push({
        id: h.id,
        participants: Number(h.participants) || 0,
        note: h.internal_note ?? null,
      });
    }
  }

  const result = (schedules || []).map((s: any) => {
    const act = activityMap[s.activity_id] || {};
    const plans = act.plans || [];
    const plan = plans.find((p: any) => p.id === s.plan_id);
    const externalHolds = holdsBySchedule[s.id] || [];
    const externalHoldCount = externalHolds.reduce((sum, h) => sum + h.participants, 0);
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
      externalHoldCount,
      externalHolds,
      status: s.status,
      guideNote: s.guide_note,
    };
  });

  return Response.json(ok(result));
}
