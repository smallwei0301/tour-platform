export function checkPlanScheduleDurationMismatch(plan, schedule, options = {}) {
  if (!schedule || schedule.plan_id != null) return null;

  const planDuration = Number(plan?.duration_minutes);
  if (!Number.isFinite(planDuration) || planDuration <= 0) return null;

  const startMs = Date.parse(schedule.start_at);
  const endMs = Date.parse(schedule.end_at);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  const actualMin = Math.round((endMs - startMs) / 60_000);
  const tolerance = Number.isFinite(options.toleranceMinutes) ? options.toleranceMinutes : 5;
  if (Math.abs(actualMin - planDuration) <= tolerance) return null;

  return {
    reasonCode: 'PLAN_SCHEDULE_MISMATCH',
    messageZh: `所選方案的時長（${planDuration} 分鐘）與場次實際時段（${actualMin} 分鐘）不符，請從活動頁重新選擇方案或場次。`,
  };
}
