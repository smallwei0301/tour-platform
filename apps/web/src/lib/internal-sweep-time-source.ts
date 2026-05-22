export function pickEffectiveStartAt(
  bookingStartAt: string | null | undefined,
  legacyScheduleStartAt: string | null | undefined
): string | null {
  return bookingStartAt ?? legacyScheduleStartAt ?? null;
}

export function isOrderInReminderWindow(
  effectiveStartAt: string | null | undefined,
  fromIso: string,
  toIso: string
): boolean {
  if (!effectiveStartAt) return false;
  const t = Date.parse(effectiveStartAt);
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(t) || !Number.isFinite(from) || !Number.isFinite(to)) return false;
  return t >= from && t < to;
}

export function isOrderEligibleForSettlement(
  effectiveStartAt: string | null | undefined,
  cutoffIso: string
): boolean {
  if (!effectiveStartAt) return false;
  const t = Date.parse(effectiveStartAt);
  const cutoff = Date.parse(cutoffIso);
  if (!Number.isFinite(t) || !Number.isFinite(cutoff)) return false;
  return t <= cutoff;
}

export type SweepReminderActivity = {
  title: string;
  meeting_point: string;
  meeting_point_map_url: string;
  notices?: unknown;
};

export type SweepReminderRow = {
  bookings?: {
    start_at?: string | null;
    activities?: SweepReminderActivity | null;
  } | null;
  activity_schedules?: {
    id?: string;
    start_at?: string | null;
    activities?: SweepReminderActivity | null;
  }[] | null;
};

export function resolveReminderActivityAndStart(order: SweepReminderRow): {
  effectiveStartAt: string | null;
  scheduleId: string | null;
  activity: SweepReminderActivity | null;
} {
  const booking = order.bookings ?? null;
  const schedule = order.activity_schedules?.[0] ?? null;

  return {
    effectiveStartAt: pickEffectiveStartAt(booking?.start_at ?? null, schedule?.start_at ?? null),
    scheduleId: schedule?.id ?? null,
    activity: schedule?.activities ?? booking?.activities ?? null,
  };
}
