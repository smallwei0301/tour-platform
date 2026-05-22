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
