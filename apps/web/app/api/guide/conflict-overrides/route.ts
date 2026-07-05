/**
 * GET /api/guide/conflict-overrides — 導遊「待確認幫手」清單（#1497）
 *
 * 管理者例外加開且需要幫手的時段（requires_helper=true 且 helper_status 仍待協調）。
 * 導遊只看自己的（guide_id 比對）、status='active'。join 活動名稱供顯示。
 */
import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { GUIDE_ACTIONABLE_HELPER_STATUSES } from '../../../../src/lib/conflict-override-transition.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../src/config/supabase-service-env.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!getSupabaseUrl()) {
    // 無 DB（本地/測試）→ 空清單，不報錯。
    return Response.json(ok({ overrides: [] }));
  }

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('guide_slot_conflict_overrides')
      .select('id, activity_id, activity_plan_id, start_at, end_at, reason, requires_helper, helper_status, guide_note, helper_decided_at, status, created_at, activities(title)')
      .eq('guide_id', session.guideId)
      .eq('status', 'active')
      .eq('requires_helper', true)
      .in('helper_status', [...GUIDE_ACTIONABLE_HELPER_STATUSES])
      .order('start_at', { ascending: true });

    if (error) {
      console.error('[guide conflict-overrides] list error:', error);
      return Response.json(fail('SERVER_ERROR', 'Failed to list overrides'), { status: 500 });
    }

    const overrides = (data ?? []).map((row) => {
      const activity = row.activities as { title?: string } | { title?: string }[] | null;
      const title = Array.isArray(activity) ? activity[0]?.title : activity?.title;
      return {
        id: row.id,
        activityId: row.activity_id,
        activityPlanId: row.activity_plan_id,
        activityTitle: title ?? '您的行程',
        startAt: row.start_at,
        endAt: row.end_at,
        reason: row.reason,
        requiresHelper: row.requires_helper,
        helperStatus: row.helper_status,
        guideNote: row.guide_note,
        createdAt: row.created_at,
      };
    });

    return Response.json(ok({ overrides }));
  } catch (err) {
    console.error('[guide conflict-overrides] server error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}
