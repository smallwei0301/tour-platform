import test from 'node:test';
import assert from 'node:assert/strict';
import { computePostTripStatus } from '../../src/lib/post-trip-eligibility.mjs';

// Issue #1106 — Post-Trip Ops workflow: consolidate the (already-built) component
// predicates into ONE verifiable end-to-end contract. The individual predicates
// are covered by issue1106-post-trip-eligibility.test.mjs; this matrix locks the
// unified `computePostTripStatus` across the full order-state matrix so the
// completion → review-invitation → guide-report → admin-followup → payout chain
// stays coherent.
//
// Fixed clock: activity ended 48h before `now` (so the >=24h review window and
// the 24h trip-report deadline have both elapsed).

const END = new Date('2026-06-01T12:00:00Z');
const NOW = new Date('2026-06-03T12:00:00Z');
const SUBMITTED = new Date('2026-06-01T20:00:00Z'); // guide filed the trip report

const MATRIX = [
  {
    name: 'clean completed order with trip report filed → payable, review-eligible, no follow-up',
    input: { orderStatus: 'completed', submittedAt: SUBMITTED },
    expect: { completionEligible: true, reviewInvitationEligible: true, payoutHoldReason: null, tripReportStatus: 'submitted', adminFollowupCategory: null },
  },
  {
    name: 'overdue trip report (otherwise clean) → still review-eligible + payable but guide_report_risk follow-up',
    input: { orderStatus: 'completed', submittedAt: null },
    expect: { completionEligible: true, reviewInvitationEligible: true, payoutHoldReason: null, tripReportStatus: 'overdue', adminFollowupCategory: 'guide_report_risk' },
  },
  {
    name: 'no-show → no review invitation (report filed, no hold, no follow-up)',
    input: { orderStatus: 'completed', submittedAt: SUBMITTED, isNoShow: true },
    expect: { completionEligible: true, reviewInvitationEligible: false, payoutHoldReason: null, tripReportStatus: 'submitted', adminFollowupCategory: null },
  },
  {
    name: 'partial/full refund → no review invitation + payout held (refund_pending)',
    input: { orderStatus: 'refunded', submittedAt: SUBMITTED, refundAmountTwd: 500 },
    expect: { completionEligible: false, reviewInvitationEligible: false, payoutHoldReason: 'refund_pending', tripReportStatus: 'submitted', adminFollowupCategory: null },
  },
  {
    name: 'payment dispute → no review, payout held, payment_order_mismatch follow-up',
    input: { orderStatus: 'completed', submittedAt: SUBMITTED, isDisputed: true },
    expect: { completionEligible: true, reviewInvitationEligible: false, payoutHoldReason: 'payment_dispute', tripReportStatus: 'submitted', adminFollowupCategory: 'payment_order_mismatch' },
  },
  {
    name: 'safety case → no review, payout held, refund_dispute_safety follow-up',
    input: { orderStatus: 'completed', submittedAt: SUBMITTED, isSafetyCase: true },
    expect: { completionEligible: true, reviewInvitationEligible: false, payoutHoldReason: 'safety_review', tripReportStatus: 'submitted', adminFollowupCategory: 'refund_dispute_safety' },
  },
  {
    name: 'complaint under review → no review, payout held, refund_dispute_safety follow-up',
    input: { orderStatus: 'completed', submittedAt: SUBMITTED, hasComplaint: true },
    expect: { completionEligible: true, reviewInvitationEligible: false, payoutHoldReason: 'complaint_under_review', tripReportStatus: 'submitted', adminFollowupCategory: 'refund_dispute_safety' },
  },
  {
    name: 'oversell investigation → payout held but review still eligible (oversell is not a review exclusion)',
    input: { orderStatus: 'completed', submittedAt: SUBMITTED, hasOversellIssue: true },
    expect: { completionEligible: true, reviewInvitationEligible: true, payoutHoldReason: 'oversell_investigation', tripReportStatus: 'submitted', adminFollowupCategory: null },
  },
  {
    name: 'negative review → review_moderation follow-up, payout not auto-held by the review alone',
    input: { orderStatus: 'completed', submittedAt: SUBMITTED, isNegativeReview: true },
    expect: { completionEligible: true, reviewInvitationEligible: true, payoutHoldReason: null, tripReportStatus: 'submitted', adminFollowupCategory: 'review_moderation' },
  },
];

for (const row of MATRIX) {
  test(`computePostTripStatus matrix: ${row.name}`, () => {
    const result = computePostTripStatus({ scheduleEndAt: END, now: NOW, ...row.input });
    assert.deepEqual(result, row.expect);
  });
}

test('invariant: a held/refunded/dispute/safety/complaint order is NEVER review-eligible', () => {
  for (const flag of [
    { isDisputed: true }, { isSafetyCase: true }, { hasComplaint: true },
    { refundAmountTwd: 1 }, { orderStatus: 'refunded' }, { orderStatus: 'cancelled' }, { isNoShow: true },
  ]) {
    const r = computePostTripStatus({ orderStatus: 'completed', scheduleEndAt: END, now: NOW, submittedAt: SUBMITTED, ...flag });
    assert.equal(r.reviewInvitationEligible, false, `expected not review-eligible for ${JSON.stringify(flag)}`);
  }
});

test('invariant: completion alone does NOT make an order payable when a hold applies', () => {
  // payout hold must win over completion for refund/dispute/safety/complaint/oversell.
  for (const [flag, reason] of [
    [{ isDisputed: true }, 'payment_dispute'],
    [{ isSafetyCase: true }, 'safety_review'],
    [{ hasComplaint: true }, 'complaint_under_review'],
    [{ refundAmountTwd: 1 }, 'refund_pending'],
    [{ hasOversellIssue: true }, 'oversell_investigation'],
  ]) {
    const r = computePostTripStatus({ orderStatus: 'completed', scheduleEndAt: END, now: NOW, submittedAt: SUBMITTED, ...flag });
    assert.equal(r.completionEligible, true);
    assert.equal(r.payoutHoldReason, reason);
  }
});
