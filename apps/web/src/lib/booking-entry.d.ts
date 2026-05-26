export interface BookingUrlScheduleLike {
  id?: string | number | null;
  scheduleId?: string | number | null;
  schedule_id?: string | number | null;
  planId?: string | number | null;
  plan_id?: string | number | null;
}

export interface BookingUrlPlanLike {
  id?: string | number | null;
  status?: string | null;
}

export function resolveBookingEntryHref(args: {
  activitySlug?: string | null;
  useBookingV2?: boolean;
}): string;

export function resolvePlanBookingHref(args: {
  activitySlug?: string | null;
  planId?: string | number | null;
  date?: string | null;
  scheduleId?: string | number | null;
  useBookingV2?: boolean;
}): string;

export function inferPlanIdForBookingUrl(args: {
  explicitPlanId?: string | number | null;
  scheduleId?: string | number | null;
  schedules?: BookingUrlScheduleLike[];
  plans?: BookingUrlPlanLike[];
}): string;
