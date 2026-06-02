import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCompletionEligible,
  isReviewInvitationEligible,
  isPayoutOnHold,
  tripReportStatus,
  adminFollowupCategory,
} from '../../src/lib/post-trip-eligibility.mjs';

const NOW = new Date('2026-06-03T10:00:00Z');
const PAST_END = new Date('2026-06-01T12:00:00Z');   // 46h ago
const RECENT_END = new Date('2026-06-03T02:00:00Z');  // 8h ago (< 24h)
const FUTURE_END = new Date('2026-06-04T10:00:00Z');  // future

// ── isCompletionEligible (7 cases) ────────────────────────────────────────────

describe('isCompletionEligible', () => {
  it('1. paid + past end → true', () => {
    assert.equal(isCompletionEligible({ orderStatus: 'paid', scheduleEndAt: PAST_END, now: NOW }), true);
  });

  it('2. confirmed + past end → true', () => {
    assert.equal(isCompletionEligible({ orderStatus: 'confirmed', scheduleEndAt: PAST_END, now: NOW }), true);
  });

  it('3. pending_payment + past end → false', () => {
    assert.equal(isCompletionEligible({ orderStatus: 'pending_payment', scheduleEndAt: PAST_END, now: NOW }), false);
  });

  it('4. cancelled + past end → false', () => {
    assert.equal(isCompletionEligible({ orderStatus: 'cancelled', scheduleEndAt: PAST_END, now: NOW }), false);
  });

  it('5. refunded + past end → false', () => {
    assert.equal(isCompletionEligible({ orderStatus: 'refunded', scheduleEndAt: PAST_END, now: NOW }), false);
  });

  it('6. paid + future end → false (activity not yet happened)', () => {
    assert.equal(isCompletionEligible({ orderStatus: 'paid', scheduleEndAt: FUTURE_END, now: NOW }), false);
  });

  it('7. completed status + past end → true (already marked complete)', () => {
    assert.equal(isCompletionEligible({ orderStatus: 'completed', scheduleEndAt: PAST_END, now: NOW }), true);
  });
});

// ── isReviewInvitationEligible (10 cases) ─────────────────────────────────────

describe('isReviewInvitationEligible', () => {
  it('1. completed + >24h + no exclusions → true', () => {
    assert.equal(
      isReviewInvitationEligible({ orderStatus: 'completed', scheduleEndAt: PAST_END, now: NOW }),
      true
    );
  });

  it('2. completed + <24h (recent_end) → false (not enough time)', () => {
    assert.equal(
      isReviewInvitationEligible({ orderStatus: 'completed', scheduleEndAt: RECENT_END, now: NOW }),
      false
    );
  });

  it('3. cancelled → false', () => {
    assert.equal(
      isReviewInvitationEligible({ orderStatus: 'cancelled', scheduleEndAt: PAST_END, now: NOW }),
      false
    );
  });

  it('4. refunded → false', () => {
    assert.equal(
      isReviewInvitationEligible({ orderStatus: 'refunded', scheduleEndAt: PAST_END, now: NOW }),
      false
    );
  });

  it('5. no_show → false', () => {
    assert.equal(
      isReviewInvitationEligible({ orderStatus: 'completed', scheduleEndAt: PAST_END, now: NOW, isNoShow: true }),
      false
    );
  });

  it('6. disputed → false', () => {
    assert.equal(
      isReviewInvitationEligible({ orderStatus: 'completed', scheduleEndAt: PAST_END, now: NOW, isDisputed: true }),
      false
    );
  });

  it('7. hasComplaint=true → false', () => {
    assert.equal(
      isReviewInvitationEligible({ orderStatus: 'completed', scheduleEndAt: PAST_END, now: NOW, hasComplaint: true }),
      false
    );
  });

  it('8. refundAmountTwd > 0 → false', () => {
    assert.equal(
      isReviewInvitationEligible({ orderStatus: 'completed', scheduleEndAt: PAST_END, now: NOW, refundAmountTwd: 500 }),
      false
    );
  });

  it('9. paid + >24h + no exclusions → true (paid but activity completed)', () => {
    assert.equal(
      isReviewInvitationEligible({ orderStatus: 'paid', scheduleEndAt: PAST_END, now: NOW }),
      true
    );
  });

  it('10. isSafetyCase=true → false', () => {
    assert.equal(
      isReviewInvitationEligible({ orderStatus: 'completed', scheduleEndAt: PAST_END, now: NOW, isSafetyCase: true }),
      false
    );
  });
});

// ── isPayoutOnHold (7 cases) ──────────────────────────────────────────────────

describe('isPayoutOnHold', () => {
  it('1. clean completed order → null (no hold)', () => {
    assert.equal(isPayoutOnHold({}), null);
  });

  it('2. refundAmountTwd > 0 → "refund_pending"', () => {
    assert.equal(isPayoutOnHold({ refundAmountTwd: 500 }), 'refund_pending');
  });

  it('3. hasComplaint → "complaint_under_review"', () => {
    assert.equal(isPayoutOnHold({ hasComplaint: true }), 'complaint_under_review');
  });

  it('4. hasOversellIssue → "oversell_investigation"', () => {
    assert.equal(isPayoutOnHold({ hasOversellIssue: true }), 'oversell_investigation');
  });

  it('5. isDisputed → "payment_dispute"', () => {
    assert.equal(isPayoutOnHold({ isDisputed: true }), 'payment_dispute');
  });

  it('6. isSafetyCase → "safety_review"', () => {
    assert.equal(isPayoutOnHold({ isSafetyCase: true }), 'safety_review');
  });

  it('7. multiple flags → returns first/most-severe reason (payment_dispute wins)', () => {
    assert.equal(
      isPayoutOnHold({ isDisputed: true, isSafetyCase: true, hasComplaint: true, refundAmountTwd: 100, hasOversellIssue: true }),
      'payment_dispute'
    );
  });
});

// ── tripReportStatus (6 cases) ────────────────────────────────────────────────

describe('tripReportStatus', () => {
  const PAST_END_TS = new Date('2026-06-01T12:00:00Z');
  const NOW_TS = new Date('2026-06-03T10:00:00Z');
  const RECENT_END_TS = new Date('2026-06-03T08:00:00Z'); // 2h ago (within 24h)
  const SUBMITTED_AT = new Date('2026-06-02T10:00:00Z');

  it('1. submitted → "submitted" regardless of deadline', () => {
    assert.equal(tripReportStatus({ scheduleEndAt: PAST_END_TS, submittedAt: SUBMITTED_AT, now: NOW_TS }), 'submitted');
  });
  it('2. null submittedAt + past deadline → "overdue"', () => {
    assert.equal(tripReportStatus({ scheduleEndAt: PAST_END_TS, submittedAt: null, now: NOW_TS }), 'overdue');
  });
  it('3. undefined submittedAt + past deadline → "overdue"', () => {
    assert.equal(tripReportStatus({ scheduleEndAt: PAST_END_TS, now: NOW_TS }), 'overdue');
  });
  it('4. no submission + within 24h grace → "pending"', () => {
    assert.equal(tripReportStatus({ scheduleEndAt: RECENT_END_TS, now: NOW_TS }), 'pending');
  });
  it('5. exactly at 24h boundary → "overdue" (exclusive)', () => {
    const exactEnd = new Date(NOW_TS.getTime() - 24 * 60 * 60 * 1000);
    assert.equal(tripReportStatus({ scheduleEndAt: exactEnd, now: NOW_TS }), 'overdue');
  });
  it('6. submitted = empty string treated as falsy → "overdue" if past deadline', () => {
    assert.equal(tripReportStatus({ scheduleEndAt: PAST_END_TS, submittedAt: '', now: NOW_TS }), 'overdue');
  });
});

// ── adminFollowupCategory (7 cases) ───────────────────────────────────────────

describe('adminFollowupCategory', () => {
  it('1. isSafetyCase → "refund_dispute_safety"', () => {
    assert.equal(adminFollowupCategory({ isSafetyCase: true }), 'refund_dispute_safety');
  });
  it('2. hasComplaint → "refund_dispute_safety"', () => {
    assert.equal(adminFollowupCategory({ hasComplaint: true }), 'refund_dispute_safety');
  });
  it('3. isDisputed → "payment_order_mismatch"', () => {
    assert.equal(adminFollowupCategory({ isDisputed: true }), 'payment_order_mismatch');
  });
  it('4. isPaymentDispute → "payment_order_mismatch"', () => {
    assert.equal(adminFollowupCategory({ isPaymentDispute: true }), 'payment_order_mismatch');
  });
  it('5. missingTripReport → "guide_report_risk"', () => {
    assert.equal(adminFollowupCategory({ missingTripReport: true }), 'guide_report_risk');
  });
  it('6. isNegativeReview → "review_moderation"', () => {
    assert.equal(adminFollowupCategory({ isNegativeReview: true }), 'review_moderation');
  });
  it('7. safety wins over complaint + dispute + missingReport + negative review', () => {
    assert.equal(adminFollowupCategory({ isSafetyCase: true, isDisputed: true, missingTripReport: true, isNegativeReview: true }), 'refund_dispute_safety');
  });
});

// ── computePostTripStatus convenience function ────────────────────────────────
describe('computePostTripStatus convenience', () => {
  it('returns all 5 status fields for a clean completed order', () => {
    const result = import('../../src/lib/post-trip-eligibility.mjs').then(m => {
      const result = m.computePostTripStatus({
        orderStatus: 'completed',
        scheduleEndAt: new Date('2026-06-01T12:00:00Z'),
        now: new Date('2026-06-03T10:00:00Z'),
      });
      assert.equal(typeof result.completionEligible, 'boolean');
      assert.equal(typeof result.reviewInvitationEligible, 'boolean');
      assert.ok('payoutHoldReason' in result);
      assert.ok('tripReportStatus' in result);
      assert.ok('adminFollowupCategory' in result);
    });
    return result;
  });
});
