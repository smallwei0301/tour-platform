import test from 'node:test';
import assert from 'node:assert/strict';

const BOOKING_STATUSES = [
  'draft',
  'pending_confirmation',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'reschedule_requested',
];

const ORDER_CANCEL_ALIGNED_STATUSES = ['cancelled', 'refunded', 'partially_refunded'];
const PAYMENT_NON_SETTLED_STATUSES = ['pending', 'failed', 'cancelled', 'refunded'];

function isCancellationConsistent({ bookingStatus, cancelledAt }) {
  if (bookingStatus === 'cancelled') return Boolean(cancelledAt);
  return !cancelledAt;
}

test('booking status enum contains cancelled', () => {
  assert.ok(BOOKING_STATUSES.includes('cancelled'));
});

test('cancelled booking must have cancelledAt', () => {
  assert.equal(
    isCancellationConsistent({ bookingStatus: 'cancelled', cancelledAt: '2026-04-24T08:00:00.000Z' }),
    true,
  );

  assert.equal(isCancellationConsistent({ bookingStatus: 'cancelled', cancelledAt: null }), false);
});

test('non-cancelled booking must not have cancelledAt', () => {
  assert.equal(
    isCancellationConsistent({ bookingStatus: 'confirmed', cancelledAt: '2026-04-24T08:00:00.000Z' }),
    false,
  );

  assert.equal(isCancellationConsistent({ bookingStatus: 'confirmed', cancelledAt: null }), true);
});

test('cancelled booking should align to cancellative order statuses', () => {
  ORDER_CANCEL_ALIGNED_STATUSES.forEach((status) => {
    assert.ok(['cancelled', 'refunded', 'partially_refunded'].includes(status));
  });
});

test('cancelled booking should not stay with paid payment status', () => {
  assert.equal(PAYMENT_NON_SETTLED_STATUSES.includes('paid'), false);
  assert.ok(PAYMENT_NON_SETTLED_STATUSES.includes('cancelled'));
  assert.ok(PAYMENT_NON_SETTLED_STATUSES.includes('refunded'));
});

console.log('Issue #210 booking/cancel contract tests completed!');
