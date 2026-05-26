function uniqueTrimmedValues(rawValues) {
  const values = new Set();
  for (const raw of rawValues) {
    const value = String(raw || '').trim();
    if (value) values.add(value);
  }
  return Array.from(values);
}

export function resolveBookingEntryHref({ activitySlug, useBookingV2 }) {
  const slug = encodeURIComponent(String(activitySlug || '').trim());
  if (!slug) return '/activities';
  return useBookingV2 ? `/booking/${slug}` : `/checkout?slug=${slug}`;
}

export function resolvePlanBookingHref({ activitySlug, planId, date, scheduleId, useBookingV2 }) {
  const slug = encodeURIComponent(String(activitySlug || '').trim());
  if (!slug) return '/activities';

  if (!useBookingV2) {
    const params = new URLSearchParams({ slug: String(activitySlug || '').trim() });
    if (planId) params.set('plan', String(planId));
    if (date) params.set('date', String(date));
    if (scheduleId) params.set('scheduleId', String(scheduleId));
    return `/checkout?${params.toString()}`;
  }

  const params = new URLSearchParams();
  if (planId) params.set('plan', String(planId));
  if (date) params.set('date', String(date));
  if (scheduleId) params.set('scheduleId', String(scheduleId));
  const qs = params.toString();
  return `/booking/${slug}${qs ? `?${qs}` : ''}`;
}

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
