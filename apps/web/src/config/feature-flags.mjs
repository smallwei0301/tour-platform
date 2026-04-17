function isTruthy(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Booking V2 rollout flag (Phase B2)
 * Uses NEXT_PUBLIC_ prefix because booking page is a client component.
 */
export function isBookingV2Enabled(env = process.env) {
  return isTruthy(env.NEXT_PUBLIC_BOOKING_V2_ENABLED);
}

export const __internal = { isTruthy };
