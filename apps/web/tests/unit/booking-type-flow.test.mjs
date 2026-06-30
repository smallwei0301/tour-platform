import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOOKING_TYPES,
  normalizeBookingType,
  requiresGuideApproval,
  initialApprovalStatusForBookingType,
  isDynamicAvailabilityApplicable,
  canCheckout,
  shouldAutoConfirmOnPayment,
  decideApproval,
} from '../../src/lib/booking-type-flow.mjs';

test('normalizeBookingType: known values pass through, unknown → instant', () => {
  for (const bt of BOOKING_TYPES) {
    assert.equal(normalizeBookingType(bt), bt);
  }
  assert.equal(normalizeBookingType(undefined), 'instant');
  assert.equal(normalizeBookingType(null), 'instant');
  assert.equal(normalizeBookingType('garbage'), 'instant');
});

test('requiresGuideApproval: only request gates payment', () => {
  assert.equal(requiresGuideApproval('request'), true);
  assert.equal(requiresGuideApproval('instant'), false);
  assert.equal(requiresGuideApproval('scheduled'), false);
  assert.equal(requiresGuideApproval(undefined), false);
});

test('initialApprovalStatusForBookingType: request → pending, others → not_required', () => {
  assert.equal(initialApprovalStatusForBookingType('request'), 'pending');
  assert.equal(initialApprovalStatusForBookingType('instant'), 'not_required');
  assert.equal(initialApprovalStatusForBookingType('scheduled'), 'not_required');
  assert.equal(initialApprovalStatusForBookingType(null), 'not_required');
});

test('isDynamicAvailabilityApplicable: scheduled → false, instant/request → true', () => {
  // 排程方案只看固定場次，動態可預約時段規則對它無效。
  assert.equal(isDynamicAvailabilityApplicable('scheduled'), false);
  // 即時／申請只看導遊可行時間（動態規則）。
  assert.equal(isDynamicAvailabilityApplicable('instant'), true);
  assert.equal(isDynamicAvailabilityApplicable('request'), true);
  // 未知值依 normalize 回退 instant → 適用動態規則。
  assert.equal(isDynamicAvailabilityApplicable(undefined), true);
  assert.equal(isDynamicAvailabilityApplicable(null), true);
  assert.equal(isDynamicAvailabilityApplicable('garbage'), true);
});

test('canCheckout: request blocked until approved, others always allowed', () => {
  // request gate
  assert.deepEqual(canCheckout('request', 'pending'), {
    allowed: false,
    code: 'APPROVAL_REQUIRED',
    messageZh: '此行程需導遊審核通過後才能付款',
  });
  assert.deepEqual(canCheckout('request', 'rejected').allowed, false);
  assert.deepEqual(canCheckout('request', 'not_required').allowed, false);
  assert.deepEqual(canCheckout('request', 'approved'), { allowed: true });

  // instant / scheduled never gated
  assert.deepEqual(canCheckout('instant', 'not_required'), { allowed: true });
  assert.deepEqual(canCheckout('scheduled', 'not_required'), { allowed: true });
});

test('shouldAutoConfirmOnPayment: all types confirm after payment (this version)', () => {
  assert.equal(shouldAutoConfirmOnPayment('instant'), true);
  assert.equal(shouldAutoConfirmOnPayment('scheduled'), true);
  assert.equal(shouldAutoConfirmOnPayment('request'), true);
});

test('decideApproval: approve a pending request keeps draft, marks approved', () => {
  const result = decideApproval({
    bookingStatus: 'draft',
    guideApprovalStatus: 'pending',
    bookingType: 'request',
    action: 'approve',
  });
  assert.deepEqual(result, {
    ok: true,
    nextGuideApprovalStatus: 'approved',
    nextBookingStatus: 'draft',
  });
});

test('decideApproval: reject a pending request cancels booking', () => {
  const result = decideApproval({
    bookingStatus: 'draft',
    guideApprovalStatus: 'pending',
    bookingType: 'request',
    action: 'reject',
  });
  assert.deepEqual(result, {
    ok: true,
    nextGuideApprovalStatus: 'rejected',
    nextBookingStatus: 'cancelled',
  });
});

test('decideApproval: non-request plan is not approvable', () => {
  const result = decideApproval({
    bookingStatus: 'draft',
    guideApprovalStatus: 'not_required',
    bookingType: 'instant',
    action: 'approve',
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_APPROVABLE');
});

test('decideApproval: already-decided request cannot be re-decided', () => {
  for (const approval of ['approved', 'rejected']) {
    const result = decideApproval({
      bookingStatus: 'draft',
      guideApprovalStatus: approval,
      bookingType: 'request',
      action: 'approve',
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NOT_PENDING_APPROVAL');
  }
});

test('decideApproval: paid/non-draft request cannot be decided', () => {
  const result = decideApproval({
    bookingStatus: 'confirmed',
    guideApprovalStatus: 'pending',
    bookingType: 'request',
    action: 'reject',
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_PENDING_APPROVAL');
});

test('decideApproval: invalid action rejected', () => {
  const result = decideApproval({
    bookingStatus: 'draft',
    guideApprovalStatus: 'pending',
    bookingType: 'request',
    action: 'cancel',
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_ACTION');
});
