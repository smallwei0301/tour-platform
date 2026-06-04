/**
 * Resolves the V2 plan binding for an admin schedule creation request.
 * Used by POST /api/v2/admin/activities/:activityId/schedules.
 *
 * Inputs:
 *   - requestedPlanId: string | null | undefined
 *   - activityId: string (from URL param)
 *   - activePlans: Array<{ id, activity_id, status, ... }> — already fetched,
 *     pre-filtered to status='active' for this activity (the route does the
 *     query; this function just enforces the rules).
 *
 * Returns:
 *   { ok: true, planId: string }
 *   { ok: false, code: 'PLAN_NOT_ACTIVE'   | 'WRONG_ACTIVITY_PLAN' | 'AMBIGUOUS_PLAN',
 *     messageZh: string }
 */
export function resolveAdminSchedulePlan({ requestedPlanId, activityId, activePlans }) {
  const plans = Array.isArray(activePlans) ? activePlans.filter(Boolean) : [];

  if (typeof requestedPlanId === 'string' && requestedPlanId.length > 0) {
    const match = plans.find((p) => p.id === requestedPlanId);
    if (!match) {
      return {
        ok: false,
        code: 'PLAN_NOT_ACTIVE',
        messageZh: '所選方案不存在或未啟用，請先到方案管理啟用 V2 方案。',
      };
    }
    if (match.activity_id !== activityId) {
      return {
        ok: false,
        code: 'WRONG_ACTIVITY_PLAN',
        messageZh: '所選方案不屬於此活動，請重新選擇方案。',
      };
    }
    return { ok: true, planId: requestedPlanId };
  }

  // requestedPlanId null / undefined / empty → ambiguity gate.
  if (plans.length === 1) {
    return { ok: true, planId: plans[0].id };
  }
  if (plans.length === 0) {
    return {
      ok: false,
      code: 'AMBIGUOUS_PLAN',
      messageZh: '此活動沒有可用的 V2 方案，請先到方案管理建立並啟用方案。',
    };
  }
  return {
    ok: false,
    code: 'AMBIGUOUS_PLAN',
    messageZh: `此活動有 ${plans.length} 個啟用中的方案，請明確選擇一個方案再新增場次。`,
  };
}
