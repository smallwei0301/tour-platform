function uniqueTrimmedValues(rawValues) {
  const values = new Set();
  for (const raw of rawValues) {
    const value = String(raw || '').trim();
    if (value) values.add(value);
  }
  return Array.from(values);
}

// Legacy 退役階段二（#1406，owner 拍板 2026-07-02 務實派解鎖）：
// 移除 legacy `/checkout` 入口。booking entry 一律導向 Booking V2 `/booking/[slug]`，
// 即使 `NEXT_PUBLIC_BOOKING_V2_ENABLED=0` 也不再產生可達 legacy checkout 的連結。
// `useBookingV2` 參數保留以維持既有呼叫端簽章相容，但不再影響輸出（一律走 V2）。
// flag 本身於階段三才退場（見 docs/operations/booking-v2-rollback-runbook.md）。
export function resolveBookingEntryHref({ activitySlug, useBookingV2 }) {
  void useBookingV2;
  const slug = encodeURIComponent(String(activitySlug || '').trim());
  if (!slug) return '/activities';
  return `/booking/${slug}`;
}

export function resolvePlanBookingHref({ activitySlug, planId, date, scheduleId, useBookingV2 }) {
  void useBookingV2;
  const slug = encodeURIComponent(String(activitySlug || '').trim());
  if (!slug) return '/activities';

  const params = new URLSearchParams();
  if (planId) params.set('plan', String(planId));
  if (date) params.set('date', String(date));
  if (scheduleId) params.set('scheduleId', String(scheduleId));
  const qs = params.toString();
  return `/booking/${slug}${qs ? `?${qs}` : ''}`;
}

/**
 * @param {{
 *   explicitPlanId?: unknown,
 *   scheduleId?: unknown,
 *   schedules?: Array<any>,
 *   plans?: Array<any>,
 * }} input
 */
export function inferPlanIdForBookingUrl({
  explicitPlanId,
  scheduleId,
  schedules = [],
  plans = [],
}) {
  const candidate = String(explicitPlanId || '').trim();
  if (candidate) return candidate;

  if (scheduleId) {
    const bySchedule = schedules.find((s) => {
      const sid = String(s?.id || '').trim();
      const scheduleAlias = String(s?.scheduleId || '').trim();
      const scheduleAliasSnake = String(s?.schedule_id || '').trim();
      return sid === String(scheduleId || '').trim() || scheduleAlias === String(scheduleId || '').trim() || scheduleAliasSnake === String(scheduleId || '').trim();
    });
    const bySchedulePlanId = String(bySchedule?.planId || bySchedule?.plan_id || '').trim();
    if (bySchedulePlanId) return bySchedulePlanId;
  }

  const schedulePlanIds = uniqueTrimmedValues((schedules || []).map((s) => s?.planId || s?.plan_id));
  if (schedulePlanIds.length === 1) return schedulePlanIds[0];

  const activeOrCandidatePlanIds = uniqueTrimmedValues(
    (plans || [])
      .filter((p) => {
        const status = String(p?.status || '').trim().toLowerCase();
        return status === 'active' || status === 'candidate';
      })
      .map((p) => p?.id),
  );
  if (activeOrCandidatePlanIds.length === 1) return activeOrCandidatePlanIds[0];
  if (activeOrCandidatePlanIds.length > 1) return '';

  const planIds = uniqueTrimmedValues((plans || []).map((p) => p?.id));
  if (planIds.length === 1) return planIds[0];

  return '';
}
