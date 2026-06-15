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
 * Per-guide LINE push (notify the assigned guide on their own LINE).
 * Default: OFF. Requires LINE_MESSAGING_ENABLED + a guide_line_mapping binding.
 */
export function isLineGuidePushEnabled(env = process.env) {
  return isTruthy(env.LINE_GUIDE_PUSH_ENABLED);
}

/**
 * Real LIFF login on the /booking/line entry (idToken verification + binding).
 * Default: OFF — flag off keeps the legacy query-param handoff for instant rollback.
 */
export function isLineLiffEnabled(env = process.env) {
  return isTruthy(env.NEXT_PUBLIC_LINE_LIFF_ENABLED);
}

/**
 * Telegram order-event notifications (admin group + guide/traveler push).
 * Default: OFF. Uses the order-notification bot (TELEGRAM_BOT_TOKEN), separate
 * from the system-alert bot (TELEGRAM_ALERT_*).
 */
export function isTelegramNotifyEnabled(env = process.env) {
  return isTruthy(env.TELEGRAM_NOTIFY_ENABLED);
}

/** Per-guide Telegram order push (requires TELEGRAM_NOTIFY_ENABLED + a binding). Default OFF. */
export function isTelegramGuideNotifyEnabled(env = process.env) {
  return isTruthy(env.TELEGRAM_GUIDE_NOTIFY_ENABLED);
}

/** Per-traveler (optional) Telegram order push (requires a binding). Default OFF. */
export function isTelegramTravelerNotifyEnabled(env = process.env) {
  return isTruthy(env.TELEGRAM_TRAVELER_NOTIFY_ENABLED);
}

export const __internal = { isTruthy };
