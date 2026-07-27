import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRequestRef,
  parseRequestRef,
} from '../../src/lib/midao/request-ref.mjs';

const BOOKING_ID = '123e4567-e89b-42d3-a456-426614174000';
const INQUIRY_ID = '987f6543-e21b-4d3c-b654-426614174999';

function assertInvalidRequestRef(operation) {
  assert.throws(operation, {
    name: 'InvalidRequestRefError',
    code: 'INVALID_REQUEST_REF',
    message: 'Invalid request reference',
  });
}

test('parseRequestRef discriminates booking and inquiry references without guessing order IDs', () => {
  assert.deepEqual(parseRequestRef(`booking_${BOOKING_ID}`), {
    kind: 'booking',
    id: BOOKING_ID,
  });
  assert.deepEqual(parseRequestRef(`inquiry_${INQUIRY_ID}`), {
    kind: 'inquiry',
    id: INQUIRY_ID,
  });
});

test('parseRequestRef normalizes UUID hex casing to one canonical reference', () => {
  assert.deepEqual(parseRequestRef(`booking_${BOOKING_ID.toUpperCase()}`), {
    kind: 'booking',
    id: BOOKING_ID,
  });
});

test('parseRequestRef rejects raw, order, unknown, malformed, padded, and non-string references deterministically', () => {
  const hostileValues = [
    BOOKING_ID,
    `order_${BOOKING_ID}`,
    `unknown_${BOOKING_ID}`,
    'booking_not-a-uuid',
    `booking_${BOOKING_ID}_extra`,
    `booking_${BOOKING_ID}/child`,
    ` booking_${BOOKING_ID}`,
    `booking_${BOOKING_ID} `,
    '',
    null,
    undefined,
    42,
    {},
  ];

  for (const value of hostileValues) {
    assertInvalidRequestRef(() => parseRequestRef(value));
  }
});

test('formatRequestRef emits canonical booking and inquiry references', () => {
  assert.equal(formatRequestRef('booking', BOOKING_ID), `booking_${BOOKING_ID}`);
  assert.equal(
    formatRequestRef('inquiry', INQUIRY_ID.toUpperCase()),
    `inquiry_${INQUIRY_ID}`,
  );
});

test('formatRequestRef rejects invalid kinds and UUIDs with the same deterministic error', () => {
  assertInvalidRequestRef(() => formatRequestRef('order', BOOKING_ID));
  assertInvalidRequestRef(() => formatRequestRef('booking', 'not-a-uuid'));
  assertInvalidRequestRef(() => formatRequestRef('booking', null));
});
