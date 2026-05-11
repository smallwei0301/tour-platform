/**
 * Contract tests for POST /api/admin/orders/:orderId/cancel
 * Issue #337: Admin order cancel + refund trigger
 *
 * Strategy: readFileSync source and assert structural contracts (RED → GREEN).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CANCEL_ROUTE = join(
  __dirname,
  '../../app/api/admin/orders/[orderId]/cancel/route.ts'
);

let src;
try {
  src = readFileSync(CANCEL_ROUTE, 'utf8');
} catch {
  src = null;
}

// AC2: cancel route file exists
test('AC2: cancel route file exists', () => {
  assert.ok(src !== null, `cancel route should exist at ${CANCEL_ROUTE}`);
});

// AC3: source calls fn_cancel_booking (via cancelOrderDb pattern)
test('AC3: source calls fn_cancel_booking or cancelBookingDb', () => {
  assert.ok(src, 'cancel route must exist');
  const hasFnCancelBooking = src.includes('fn_cancel_booking') || src.includes('cancelOrderDb') || src.includes('cancelBookingDb');
  assert.ok(hasFnCancelBooking, 'source should call fn_cancel_booking or cancelOrderDb/cancelBookingDb to release seats');
});

// AC3: source calls createAdminPosRefundEntryDb
test('AC3: source calls createAdminPosRefundEntryDb for full-amount refund', () => {
  assert.ok(src, 'cancel route must exist');
  assert.match(src, /createAdminPosRefundEntryDb/, 'source should call createAdminPosRefundEntryDb');
});

// AC3.1: idempotency — requestId guard present
test('AC3.1: source contains idempotency check (requestId)', () => {
  assert.ok(src, 'cancel route must exist');
  const hasIdempotency = src.includes('requestId') || src.includes('request_id');
  assert.ok(hasIdempotency, 'source should contain requestId idempotency guard');
});

// AC4: audit log with order_cancelled_by_admin action
test('AC4: source writes audit_logs with order_cancelled_by_admin', () => {
  assert.ok(src, 'cancel route must exist');
  assert.match(src, /order_cancelled_by_admin/, "source should contain 'order_cancelled_by_admin' audit action");
});

// AC5: 409 for locked statuses (cancelled_by_guide included)
test('AC5: source returns 409 for locked statuses including cancelled_by_guide', () => {
  assert.ok(src, 'cancel route must exist');
  const has409 = src.includes('409');
  assert.ok(has409, 'source should return 409 for locked statuses');
  const hasCancelledByGuide = src.includes('cancelled_by_guide');
  assert.ok(hasCancelledByGuide, "LOCKED_STATUSES should include 'cancelled_by_guide'");
});
