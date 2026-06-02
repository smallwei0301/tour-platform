/**
 * Pure post-trip eligibility predicates.
 * No DB access, no mutations, no side effects.
 * All date/time comparisons use injected `now` for testability.
 *
 * Mirrors the pure-policy pattern from refund-policy.ts / settlement-config.ts.
 */

const COMPLETION_ELIGIBLE_STATUSES = new Set(['paid', 'confirmed', 'completed']);

const INELIGIBLE_FOR_REVIEW_STATUSES = new Set([
  'cancelled', 'refunded', 'pending_payment', 'pending_refund',
  'cancelled_by_user', 'cancelled_by_guide',
]);

/**
 * Is the order eligible to be marked as completed?
 * Requires: order status in {paid, confirmed, completed} AND the activity has ended.
 *
 * @param {{ orderStatus: string, scheduleEndAt: Date|string, now?: Date }} opts
 * @returns {boolean}
 */
export function isCompletionEligible({ orderStatus, scheduleEndAt, now = new Date() }) {
  if (!COMPLETION_ELIGIBLE_STATUSES.has(orderStatus)) return false;
  const end = new Date(scheduleEndAt);
  return end < now;
}

/**
 * Is the traveler eligible to receive a review invitation?
 * Requires all of:
 *   - completion-eligible (activity ended + right status)
 *   - at least 24 hours have elapsed since activity end
 *   - none of: no-show, disputed, complaint, safety case, partial/full refund
 *
 * @param {{ orderStatus: string, scheduleEndAt: Date|string, now?: Date,
 *   hasComplaint?: boolean, refundAmountTwd?: number,
 *   isNoShow?: boolean, isDisputed?: boolean, isSafetyCase?: boolean }} opts
 * @returns {boolean}
 */
export function isReviewInvitationEligible({
  orderStatus,
  scheduleEndAt,
  now = new Date(),
  hasComplaint = false,
  refundAmountTwd = 0,
  isNoShow = false,
  isDisputed = false,
  isSafetyCase = false,
}) {
  // Explicitly ineligible statuses
  if (INELIGIBLE_FOR_REVIEW_STATUSES.has(orderStatus)) return false;

  // No-show travelers don't receive review invitations
  if (isNoShow) return false;

  // Activity must have ended and order must be in a completion-eligible status
  if (!isCompletionEligible({ orderStatus, scheduleEndAt, now })) return false;

  // Must be at least 24 hours after activity ended (allow time for experience to settle)
  const end = new Date(scheduleEndAt);
  const msSinceEnd = now - end;
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  if (msSinceEnd < twentyFourHoursMs) return false;

  // Dispute/complaint/safety/refund exclusions
  if (isDisputed || isSafetyCase || hasComplaint || refundAmountTwd > 0) return false;

  return true;
}

/**
 * Is the guide payout on hold for this order?
 * Returns the most-severe hold reason string, or null if no hold applies.
 *
 * Hold priority (highest → lowest severity):
 *   payment_dispute > safety_review > complaint_under_review > refund_pending > oversell_investigation
 *
 * @param {{ refundAmountTwd?: number, hasComplaint?: boolean,
 *   hasOversellIssue?: boolean, isDisputed?: boolean, isSafetyCase?: boolean }} opts
 * @returns {string|null} hold reason or null
 */
export function isPayoutOnHold({
  refundAmountTwd = 0,
  hasComplaint = false,
  hasOversellIssue = false,
  isDisputed = false,
  isSafetyCase = false,
} = {}) {
  if (isDisputed) return 'payment_dispute';
  if (isSafetyCase) return 'safety_review';
  if (hasComplaint) return 'complaint_under_review';
  if (refundAmountTwd > 0) return 'refund_pending';
  if (hasOversellIssue) return 'oversell_investigation';
  return null;
}
