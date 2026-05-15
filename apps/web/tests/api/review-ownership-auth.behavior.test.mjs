import test from 'node:test';
import assert from 'node:assert/strict';
import { isReviewSubmissionAuthorized } from '../../src/lib/review-ownership.mjs';

test('ownership: booking match gives true regardless of order ownership fallback', () => {
  assert.strictEqual(
    isReviewSubmissionAuthorized({
      booking: { traveler_id: 'user-1' },
      order: { user_id: 'user-2' },
      userId: 'user-1',
    }),
    true,
  );
});

test('ownership: booking missing + matching order owner grants access', () => {
  assert.strictEqual(
    isReviewSubmissionAuthorized({
      booking: null,
      order: { user_id: 'user-1' },
      userId: 'user-1',
    }),
    true,
  );
});

test('ownership: existing foreign booking must not pass via order fallback', () => {
  assert.strictEqual(
    isReviewSubmissionAuthorized({
      booking: { traveler_id: 'other-user' },
      order: { user_id: 'user-1' },
      userId: 'user-1',
    }),
    false,
  );
});

test('ownership: fallback must ignore orders.traveler_id and use only orders.user_id', () => {
  assert.strictEqual(
    isReviewSubmissionAuthorized({
      booking: null,
      order: { user_id: 'other-user', traveler_id: 'user-1' },
      userId: 'user-1',
    }),
    false,
  );
});
