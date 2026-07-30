import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUEST_BUCKETS,
  REQUEST_SECONDARY_STATES,
  resolveRequestBucket,
} from '../../src/lib/midao/request-buckets.mjs';

function booking(overrides = {}) {
  return {
    kind: 'booking',
    bookingStatus: 'draft',
    guideApprovalStatus: 'pending',
    orderStatus: 'pending_payment',
    needsReply: false,
    ...overrides,
  };
}

function inquiry(overrides = {}) {
  return {
    kind: 'inquiry',
    inquiryStatus: 'new',
    needsReply: false,
    ...overrides,
  };
}

function resolved(bucket, secondaryState = null) {
  return { ok: true, bucket, secondaryState };
}

function invalid(field) {
  return {
    ok: false,
    error: { code: 'INVALID_REQUEST_STATE', field },
  };
}

test('exports the closed bucket and secondary-state vocabularies', () => {
  assert.deepEqual(REQUEST_BUCKETS, ['new', 'needs_reply', 'replied', 'completed']);
  assert.deepEqual(REQUEST_SECONDARY_STATES, [
    'pending_approval',
    'awaiting_payment',
    'success',
    'rejected',
    'cancelled',
    'expired',
    'no_show',
    'refund_pending',
    'refunded',
    'closed',
  ]);
  assert.equal(Object.isFrozen(REQUEST_BUCKETS), true);
  assert.equal(Object.isFrozen(REQUEST_SECONDARY_STATES), true);
});

test('booking pending approval stays new even when a message needs reply', () => {
  assert.deepEqual(resolveRequestBucket(booking()), resolved('new', 'pending_approval'));
  assert.deepEqual(
    resolveRequestBucket(booking({ needsReply: true })),
    resolved('new', 'pending_approval'),
  );
});

test('approved booking maps traveler reply ahead of awaiting-payment replied state', () => {
  const approved = booking({ guideApprovalStatus: 'approved' });
  assert.deepEqual(resolveRequestBucket(approved), resolved('replied', 'awaiting_payment'));
  assert.deepEqual(
    resolveRequestBucket({ ...approved, needsReply: true }),
    resolved('needs_reply'),
  );
});

test('terminal booking outcomes preserve success, rejection, expiry, cancellation, refund, and no-show semantics', () => {
  const cases = [
    [booking({ bookingStatus: 'cancelled', guideApprovalStatus: 'rejected', orderStatus: 'cancelled_by_guide' }), 'rejected'],
    [booking({ bookingStatus: 'cancelled', guideApprovalStatus: 'approved', orderStatus: 'cancelled_unpaid' }), 'expired'],
    [booking({ bookingStatus: 'cancelled', guideApprovalStatus: 'approved', orderStatus: 'cancelled_by_user' }), 'cancelled'],
    [booking({ bookingStatus: 'cancelled', guideApprovalStatus: 'approved', orderStatus: 'cancelled_by_guide' }), 'cancelled'],
    [booking({ bookingStatus: 'cancelled', guideApprovalStatus: 'approved', orderStatus: 'refund_pending' }), 'refund_pending'],
    [booking({ bookingStatus: 'cancelled', guideApprovalStatus: 'approved', orderStatus: 'refunded' }), 'refunded'],
    [booking({ bookingStatus: 'no_show', guideApprovalStatus: 'approved', orderStatus: 'confirmed' }), 'no_show'],
    [booking({ bookingStatus: 'confirmed', guideApprovalStatus: 'approved', orderStatus: 'paid' }), 'success'],
    [booking({ bookingStatus: 'confirmed', guideApprovalStatus: 'approved', orderStatus: 'confirmed' }), 'success'],
    [booking({ bookingStatus: 'completed', guideApprovalStatus: 'approved', orderStatus: 'completed' }), 'success'],
  ];

  for (const [input, secondaryState] of cases) {
    assert.deepEqual(resolveRequestBucket(input), resolved('completed', secondaryState));
    assert.deepEqual(
      resolveRequestBucket({ ...input, needsReply: true }),
      resolved('completed', secondaryState),
      `terminal ${secondaryState} must ignore stale needsReply`,
    );
  }
});

test('inquiry statuses map through new, needs-reply, replied, and terminal buckets', () => {
  assert.deepEqual(resolveRequestBucket(inquiry()), resolved('new'));
  assert.deepEqual(resolveRequestBucket(inquiry({ inquiryStatus: 'new', needsReply: true })), resolved('new'));
  assert.deepEqual(resolveRequestBucket(inquiry({ inquiryStatus: 'opened', needsReply: true })), resolved('needs_reply'));
  assert.deepEqual(resolveRequestBucket(inquiry({ inquiryStatus: 'replied' })), resolved('replied'));
  assert.deepEqual(resolveRequestBucket(inquiry({ inquiryStatus: 'ready_to_convert' })), resolved('replied'));
  assert.deepEqual(resolveRequestBucket(inquiry({ inquiryStatus: 'replied', needsReply: true })), resolved('needs_reply'));
  assert.deepEqual(resolveRequestBucket(inquiry({ inquiryStatus: 'ready_to_convert', needsReply: true })), resolved('needs_reply'));
  assert.deepEqual(resolveRequestBucket(inquiry({ inquiryStatus: 'converted', needsReply: true })), resolved('completed', 'success'));
  assert.deepEqual(resolveRequestBucket(inquiry({ inquiryStatus: 'closed', needsReply: true })), resolved('completed', 'closed'));
  assert.deepEqual(resolveRequestBucket(inquiry({ inquiryStatus: 'expired', needsReply: true })), resolved('completed', 'expired'));
});

test('unknown, missing, generic, non-boolean, and contradictory states fail closed without echoing values', () => {
  const cases = [
    [null, 'input'],
    [{ status: 'pending' }, 'status'],
    [booking({ status: 'draft' }), 'status'],
    [booking({ inquiryStatus: 'new' }), 'inquiryStatus'],
    [inquiry({ bookingStatus: 'draft' }), 'bookingStatus'],
    [inquiry({ guideApprovalStatus: 'pending' }), 'guideApprovalStatus'],
    [inquiry({ orderStatus: 'pending_payment' }), 'orderStatus'],
    [{ ...booking(), kind: 'order' }, 'kind'],
    [{ ...booking(), needsReply: 'true' }, 'needsReply'],
    [{ ...booking(), bookingStatus: 'mystery' }, 'bookingStatus'],
    [{ ...booking(), guideApprovalStatus: 'not_required' }, 'guideApprovalStatus'],
    [{ ...booking(), orderStatus: 'mystery' }, 'orderStatus'],
    [booking({ guideApprovalStatus: 'approved', bookingStatus: 'cancelled', orderStatus: 'pending_payment' }), 'state'],
    [booking({ guideApprovalStatus: 'rejected', bookingStatus: 'draft', orderStatus: 'pending_payment' }), 'state'],
    [booking({ guideApprovalStatus: 'approved', bookingStatus: 'completed', orderStatus: 'pending_payment' }), 'state'],
    [inquiry({ inquiryStatus: 'opened', needsReply: false }), 'state'],
    [inquiry({ inquiryStatus: 'mystery' }), 'inquiryStatus'],
  ];

  for (const [input, field] of cases) {
    const result = resolveRequestBucket(input);
    assert.deepEqual(result, invalid(field));
    assert.equal('value' in result.error, false);
  }
});

test('resolveRequestBucket is deterministic and never mutates its input', () => {
  const input = booking({ guideApprovalStatus: 'approved', needsReply: true });
  const before = structuredClone(input);
  const first = resolveRequestBucket(input);
  const second = resolveRequestBucket(input);
  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
});
