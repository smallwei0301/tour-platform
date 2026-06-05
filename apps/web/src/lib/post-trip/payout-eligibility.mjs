/**
 * Issue #1106 — Payout-eligibility decision (backend slice).
 *
 * Issue #1106 acceptance criterion: "Payout eligibility 明確排除
 * refund/complaint/safety/payment dispute；不得因 order completed 就自動 payable".
 *
 * This helper is the single source of truth that the payout sweep,
 * payout calculation, and Admin payout review will all share. It
 * combines two existing rules into one structured decision:
 *
 *   1. Order status must be 'completed' (NOT 'paid' / 'confirmed' /
 *      'pending_payment' / 'refund_pending' / 'cancelled' / 'refunded').
 *      'paid' + 'confirmed' may enter GMV calculations (#631/#847) but
 *      are not yet payable.
 *
 *   2. None of the hold signals from isPayoutOnHold may be active:
 *      payment_dispute / safety_review / complaint_under_review /
 *      refund_pending / oversell_investigation.
 *
 * Reuses isPayoutOnHold (post-trip-eligibility.mjs) verbatim so the
 * hold semantics stay consistent with the rest of post-trip ops; this
 * helper only adds the status gate and the structured envelope.
 *
 * No Supabase, no email transport, no auth — the payout sweep route
 * remains responsible for fetching orders + operations_tracking and
 * applying this predicate per row.
 */

import { isPayoutOnHold } from '../post-trip-eligibility.mjs';

const PAYABLE_ORDER_STATUS = 'completed';

/**
 * @returns { eligible: true } | { eligible: false, reason: string }
 *
 * reason is one of:
 *   ORDER_NOT_COMPLETED — order has not reached 'completed' status yet
 *   payment_dispute     — caller signaled isDisputed=true
 *   safety_review       — caller signaled isSafetyCase=true
 *   complaint_under_review — operations_tracking.has_complaint=true
 *   refund_pending      — operations_tracking.refund_amount_twd > 0
 *   oversell_investigation — caller signaled hasOversellIssue=true
 *
 * Hold reason strings match isPayoutOnHold's return values verbatim so
 * downstream code can branch on a single canonical reason set.
 */
export function evaluatePayoutEligibility(input) {
  const orderStatus = typeof input?.orderStatus === 'string' ? input.orderStatus : '';
  if (orderStatus !== PAYABLE_ORDER_STATUS) {
    return { eligible: false, reason: 'ORDER_NOT_COMPLETED' };
  }

  const holdReason = isPayoutOnHold({
    refundAmountTwd: Number.isFinite(Number(input?.refundAmountTwd))
      ? Number(input.refundAmountTwd)
      : 0,
    hasComplaint: input?.hasComplaint === true,
    hasOversellIssue: input?.hasOversellIssue === true,
    isDisputed: input?.isDisputed === true,
    isSafetyCase: input?.isSafetyCase === true,
  });

  if (holdReason) {
    return { eligible: false, reason: holdReason };
  }

  return { eligible: true };
}
