import { ok, fail } from '../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { resolveBookingPlan } from '../../../../../../src/lib/booking-plan-resolver';
import { evaluateExternalHoldRequest } from '../../../../../../src/lib/availability-v2/external-hold-rule';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../src/config/supabase-service-env.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
}

// Map fn_create_external_hold error codes → HTTP status + 繁中訊息
function mapHoldError(error: string, message?: string): { status: number; code: string; message: string } {
  switch (error) {
    case 'schedule_not_found':
      return { status: 404, code: 'NOT_FOUND', message: '找不到此場次' };
    case 'forbidden':
      return { status: 403, code: 'FORBIDDEN', message: '無權操作此場次' };
    case 'invalid_count':
      return { status: 400, code: 'INVALID_COUNT', message: '外部佔位人數需至少 1 人' };
    case 'schedule_not_open':
      return { status: 409, code: 'SCHEDULE_NOT_OPEN', message: '此場次目前未開放，無法登記外部佔位' };
    case 'insufficient_capacity':
      return { status: 409, code: 'CAPACITY_EXCEEDED', message: message || '此場次剩餘名額不足' };
    default:
      return { status: 500, code: 'SERVER_ERROR', message: message || '登記外部佔位失敗' };
  }
}

/**
 * POST /api/guide/schedules/[scheduleId]/external-holds
 * 導遊登記「外部已售」座位：原子扣減 booked_count 並建立 external_hold booking，
 * 讓線上各通路共用同一個庫存池，杜絕外部來源造成的超賣。
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ scheduleId: string }> },
) {
  const csrf = validateCsrf(req);
  if (csrf) return csrf;

  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const { scheduleId } = await context.params;
  if (!scheduleId) return Response.json(fail('BAD_REQUEST', 'scheduleId required'), { status: 400 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const participants = Number((body as Record<string, unknown>).participants);
  const note = typeof (body as Record<string, unknown>).note === 'string'
    ? ((body as Record<string, unknown>).note as string).slice(0, 500)
    : null;

  if (!Number.isFinite(participants) || participants < 1) {
    return Response.json(fail('INVALID_COUNT', '外部佔位人數需至少 1 人'), { status: 400 });
  }

  const supabase = await getSupabase();

  // Fetch schedule + verify ownership (與 PATCH 同樣的 ownership pattern)
  const { data: schedule, error } = await supabase
    .from('activity_schedules')
    .select('id, activity_id, plan_id, capacity, booked_count, status')
    .eq('id', scheduleId)
    .single();

  if (error || !schedule) {
    return Response.json(fail('NOT_FOUND', '找不到此場次'), { status: 404 });
  }

  const { data: activity } = await supabase
    .from('activities')
    .select('guide_id')
    .eq('id', schedule.activity_id)
    .single();

  if (!activity || activity.guide_id !== session.guideId) {
    return Response.json(fail('FORBIDDEN', '無權操作此場次'), { status: 403 });
  }

  // 容量預檢（鏡像 fn_book_schedule，給友善繁中訊息；DB 端仍會原子複檢）
  const decision = evaluateExternalHoldRequest({
    capacity: schedule.capacity,
    bookedCount: schedule.booked_count,
    scheduleStatus: schedule.status,
    requestedParticipants: Math.floor(participants),
  });

  if (!decision.allowed) {
    const status = decision.reasonCode === 'INVALID_COUNT' ? 400 : 409;
    return Response.json(
      fail(decision.reasonCode || 'CAPACITY_EXCEEDED', decision.messageZh || '無法登記外部佔位'),
      { status },
    );
  }

  // 解析 activity_plans uuid，使外部佔位落在與線上預訂相同的群組容量池（Gate 1）
  let activityPlanId: string | null = null;
  const planRes = await resolveBookingPlan(supabase, {
    activityId: schedule.activity_id,
    planKey: typeof schedule.plan_id === 'string' ? schedule.plan_id : '',
    scheduleId,
  });
  if (planRes.ok) activityPlanId = planRes.planId;

  // 原子建立外部佔位（扣量 + 建 booking 同一交易，失敗整體 rollback）
  const { data: rpcResult, error: rpcError } = await supabase.rpc('fn_create_external_hold', {
    p_schedule_id: scheduleId,
    p_count: Math.floor(participants),
    p_guide_id: session.guideId,
    p_activity_plan_id: activityPlanId,
    p_note: note,
    p_actor_user_id: null,
  });

  if (rpcError) {
    return Response.json(fail('SERVER_ERROR', rpcError.message), { status: 500 });
  }

  if (!rpcResult || rpcResult.ok !== true) {
    const mapped = mapHoldError(rpcResult?.error || 'unknown', rpcResult?.message);
    return Response.json(fail(mapped.code, mapped.message), { status: mapped.status });
  }

  return Response.json(
    ok({
      holdId: rpcResult.booking_id,
      participants: Math.floor(participants),
      bookedCount: rpcResult.booked_count,
      remaining: rpcResult.remaining,
    }),
    { status: 201 },
  );
}
