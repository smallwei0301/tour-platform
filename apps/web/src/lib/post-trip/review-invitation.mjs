/**
 * Issue #1174 — Review-invitation backend slice (helpers only).
 *
 * These pure functions decide:
 *   1. Whether a post-trip review invitation may legitimately be sent for a
 *      given order (eligibility — based on order status, schedule end, and
 *      dispute/refund/no-show signals).
 *   2. Whether a send attempt should fire now, given the delivery log for
 *      this order (idempotency — prevent accidental double-sends, allow
 *      retries after failures, and require an explicit override reason for
 *      intentional resends).
 *
 * They do NOT touch Supabase, email transport, or admin auth — those live
 * in the route that will integrate this helper in a later PR.
 */

const POST_TRIP_ORDER_STATUSES = new Set(['paid', 'confirmed', 'completed']);
const BLOCKED_ORDER_STATUSES = new Set([
  'cancelled',
  'refunded',
  'refund_pending',
  'no_show',
  'disputed',
]);

const MINUTES_24H = 24 * 60;
const MS_PER_MINUTE = 60 * 1000;

/**
 * @returns { eligible: true } | { eligible: false, reason: string }
 */
export function evaluateReviewInvitationEligibility(input) {
  const orderStatus = typeof input?.orderStatus === 'string' ? input.orderStatus : '';
  const now = parseTimestamp(input?.now);
  const scheduleEndAt = parseTimestamp(input?.scheduleEndAt);

  if (input?.hasDispute === true) {
    return { eligible: false, reason: 'ORDER_DISPUTED' };
  }
  if (BLOCKED_ORDER_STATUSES.has(orderStatus)) {
    return { eligible: false, reason: orderStatusBlockedCode(orderStatus) };
  }
  if (!POST_TRIP_ORDER_STATUSES.has(orderStatus)) {
    return { eligible: false, reason: 'ORDER_NOT_COMPLETED' };
  }
  if (!Number.isFinite(scheduleEndAt)) {
    return { eligible: false, reason: 'MISSING_SCHEDULE_END' };
  }
  if (!Number.isFinite(now)) {
    return { eligible: false, reason: 'MISSING_NOW' };
  }
  const elapsedMinutes = Math.floor((now - scheduleEndAt) / MS_PER_MINUTE);
  if (elapsedMinutes < MINUTES_24H) {
    return { eligible: false, reason: 'ACTIVITY_NOT_FINISHED_24H' };
  }

  return { eligible: true };
}

/**
 * @param {{ existingInvitations?: Array<{status?: string}>, allowResend?: boolean,
 *   resendReason?: string, maxFailedAttempts?: number }} input
 *   maxFailedAttempts（選用，#1926）：failed 紀錄數達此值且尚無 sent → retry_exhausted。
 *   未傳（或非正有限數）時行為與原本完全一致（admin 手動寄送不傳）。
 * @returns { allowSend: boolean, code: string, reasonZh?: string }
 */
export function evaluateReviewInvitationIdempotency(input) {
  const records = Array.isArray(input?.existingInvitations)
    ? input.existingInvitations.filter(Boolean)
    : [];
  const allowResend = input?.allowResend === true;
  const resendReason =
    typeof input?.resendReason === 'string' ? input.resendReason.trim() : '';

  const sent = records.find((r) => r.status === 'sent');

  if (!sent) {
    const max = input?.maxFailedAttempts;
    if (typeof max === 'number' && Number.isFinite(max) && max > 0) {
      const failedCount = records.filter((r) => r.status === 'failed').length;
      if (failedCount >= max) {
        return { allowSend: false, code: 'retry_exhausted', reasonZh: '寄送失敗次數已達上限' };
      }
    }
    return { allowSend: true, code: records.length === 0 ? 'first_send' : 'retry_after_failure' };
  }

  if (!allowResend) {
    return {
      allowSend: false,
      code: 'already_sent',
      reasonZh: '此訂單已寄出評論邀請，預設不重送；若要重送請啟用覆寫並提供理由。',
    };
  }

  if (resendReason.length === 0) {
    return {
      allowSend: false,
      code: 'resend_blocked_no_reason',
      reasonZh: '重送評論邀請需要提供理由（resendReason）。',
    };
  }

  return { allowSend: true, code: 'resend_with_override' };
}

function parseTimestamp(value) {
  if (value == null) return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : NaN;
  }
  return NaN;
}

function orderStatusBlockedCode(orderStatus) {
  switch (orderStatus) {
    case 'cancelled':
      return 'ORDER_CANCELLED';
    case 'refunded':
    case 'refund_pending':
      return 'ORDER_REFUNDED';
    case 'no_show':
      return 'ORDER_NO_SHOW';
    case 'disputed':
      return 'ORDER_DISPUTED';
    default:
      return 'ORDER_BLOCKED';
  }
}
