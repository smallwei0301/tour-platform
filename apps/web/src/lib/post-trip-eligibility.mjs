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

/**
 * What is the guide's trip report status for a given activity?
 * - 'pending': activity ended, guide hasn't submitted yet, within 24h grace
 * - 'submitted': guide submitted the report
 * - 'overdue': 24h has passed since activity end without submission
 *
 * @param {{ scheduleEndAt: Date|string, submittedAt?: Date|string|null, now?: Date }} opts
 * @returns {'pending' | 'submitted' | 'overdue'}
 */
export function tripReportStatus({ scheduleEndAt, submittedAt = null, now = new Date() }) {
  if (submittedAt) return 'submitted';

  const end = new Date(scheduleEndAt);
  const deadline = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return now >= deadline ? 'overdue' : 'pending';
}

/**
 * Which admin follow-up queue should this post-trip case land in?
 * Returns the highest-severity applicable category.
 *
 * Priority: refund_dispute_safety > payment_order_mismatch > guide_report_risk > review_moderation
 *
 * @param {{ isSafetyCase?: boolean, isDisputed?: boolean, hasComplaint?: boolean,
 *   isPaymentDispute?: boolean, missingTripReport?: boolean, isNegativeReview?: boolean }} opts
 * @returns {'refund_dispute_safety' | 'payment_order_mismatch' | 'guide_report_risk' | 'review_moderation' | null}
 */
export function adminFollowupCategory({
  isSafetyCase = false,
  isDisputed = false,
  hasComplaint = false,
  isPaymentDispute = false,
  missingTripReport = false,
  isNegativeReview = false,
} = {}) {
  if (isSafetyCase || hasComplaint) return 'refund_dispute_safety';
  if (isDisputed || isPaymentDispute) return 'payment_order_mismatch';
  if (missingTripReport) return 'guide_report_risk';
  if (isNegativeReview) return 'review_moderation';
  return null;
}

/**
 * Convenience: compute all post-trip status fields for an order at once.
 * Accepts the same parameters as the individual predicates.
 *
 * @returns {{ completionEligible, reviewInvitationEligible, payoutHoldReason, tripReportStatus: string, adminFollowupCategory: string | null }}
 */
export function computePostTripStatus({
  orderStatus,
  scheduleEndAt,
  now = new Date(),
  hasComplaint = false,
  refundAmountTwd = 0,
  isNoShow = false,
  isDisputed = false,
  isSafetyCase = false,
  hasOversellIssue = false,
  submittedAt = null,
  isPaymentDispute = false,
  missingTripReport = false,
  isNegativeReview = false,
} = {}) {
  const completionEligible = isCompletionEligible({ orderStatus, scheduleEndAt, now });
  const reviewInvitationEligible = isReviewInvitationEligible({
    orderStatus, scheduleEndAt, now,
    hasComplaint, refundAmountTwd, isNoShow, isDisputed, isSafetyCase,
  });
  const payoutHoldReason = isPayoutOnHold({ refundAmountTwd, hasComplaint, hasOversellIssue, isDisputed, isSafetyCase });
  const reportStatus = tripReportStatus({ scheduleEndAt, submittedAt, now });
  const followupCategory = adminFollowupCategory({
    isSafetyCase, isDisputed, hasComplaint, isPaymentDispute,
    missingTripReport: missingTripReport || reportStatus === 'overdue',
    isNegativeReview,
  });
  return {
    completionEligible,
    reviewInvitationEligible,
    payoutHoldReason,
    tripReportStatus: reportStatus,
    adminFollowupCategory: followupCategory,
  };
}
