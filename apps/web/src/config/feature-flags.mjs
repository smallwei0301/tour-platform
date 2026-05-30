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

/**
 * LINE Messaging API for ops/admin notifications (migrated off the retired LINE Notify).
 * Default: OFF — rollout per docs/operations/issue-179-line-liff-rollout-support-sop.md.
 */
export function isLineMessagingEnabled(env = process.env) {
  return isTruthy(env.LINE_MESSAGING_ENABLED);
}

/**
 * Per-traveler LINE push (booking/payment/cancel/refund/reminder).
 * Default: OFF. Requires LINE_MESSAGING_ENABLED + a resolvable line_user_id binding.
 */
export function isLinePushEnabled(env = process.env) {
  return isTruthy(env.LINE_PUSH_ENABLED);
}

/**
 * Real LIFF login on the /booking/line entry (idToken verification + binding).
 * Default: OFF — flag off keeps the legacy query-param handoff for instant rollback.
 */
export function isLineLiffEnabled(env = process.env) {
  return isTruthy(env.NEXT_PUBLIC_LINE_LIFF_ENABLED);
}

export const __internal = { isTruthy };
