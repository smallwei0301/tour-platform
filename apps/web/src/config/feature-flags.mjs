function isTruthy(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Booking V2 rollout flag used by entry routing and non-client contracts.
 * Default: ON (aligns with isBookingV2ShellEnabled). Set NEXT_PUBLIC_BOOKING_V2_ENABLED=0 to roll back.
 */
export function isBookingV2Enabled(env = process.env) {
  if (Object.prototype.hasOwnProperty.call(env, 'NEXT_PUBLIC_BOOKING_V2_ENABLED')) {
    return isTruthy(env.NEXT_PUBLIC_BOOKING_V2_ENABLED);
  }
  if (Object.prototype.hasOwnProperty.call(env, 'BOOKING_V2')) {
    return isTruthy(env.BOOKING_V2);
  }
  return true;
}

/**
 * Booking page shell contract for client bundle:
 * - default traveler path is V2
 * - explicit legacy fallback uses public deployable flag only
 */
export function isBookingV2ShellEnabled(env = process.env) {
  if (!Object.prototype.hasOwnProperty.call(env, 'NEXT_PUBLIC_BOOKING_V2_ENABLED')) {
    return true;
  }
  return isTruthy(env.NEXT_PUBLIC_BOOKING_V2_ENABLED);
}

export const __internal = { isTruthy };
