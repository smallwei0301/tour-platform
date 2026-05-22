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
  if (Object.prototype.hasOwnProperty.call(env, 'NEXT_PUBLIC_BOOKING_V2_ENABLED')) {
    return isTruthy(env.NEXT_PUBLIC_BOOKING_V2_ENABLED);
  }
  return isTruthy(env.BOOKING_V2);
}

export const __internal = { isTruthy };
