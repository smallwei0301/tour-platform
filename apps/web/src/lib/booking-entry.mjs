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
