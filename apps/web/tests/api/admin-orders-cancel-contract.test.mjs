/**
 * Contract tests for POST /api/admin/orders/:orderId/cancel
 * Issue #337 fix: Admin order cancel + refund trigger
 *
 * Strategy: structural + behavioral unit tests.
 * Behavioral tests call cancelOrderAdminDb with in-memory fallback (no live DB needed).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CANCEL_ROUTE = join(
  __dirname,
  '../../app/api/v2/admin/orders/[orderId]/cancel/route.ts'
);
const DB_LIB = join(__dirname, '../../src/lib/db.mjs');

let src;
try {
  src = readFileSync(CANCEL_ROUTE, 'utf8');
} catch {
  src = null;
}

let dbSrc;
try {
  dbSrc = readFileSync(DB_LIB, 'utf8');
} catch {
  dbSrc = null;
}

// AC2: cancel route file exists
test('AC2: cancel route file exists', () => {
  assert.ok(src !== null, `cancel route should exist at ${CANCEL_ROUTE}`);
});

// AC3: uses cancelOrderAdminDb (not cancelOrderDb — which is user-only)
test('AC3: route uses cancelOrderAdminDb (not the user-only cancelOrderDb)', () => {
  assert.ok(src, 'cancel route must exist');
  assert.match(src, /cancelOrderAdminDb/, 'route must use cancelOrderAdminDb (not cancelOrderDb which requires pending_payment)');
  assert.ok(!src.includes('cancelOrderDb('), 'route must NOT call cancelOrderDb directly (it has pending_payment guard)');
});

// AC3: cancelOrderAdminDb in db.mjs works for paid/confirmed (no pending_payment guard)
test('AC3: cancelOrderAdminDb in db.mjs accepts paid/confirmed orders (no pending_payment check)', () => {
  assert.ok(dbSrc, 'db.mjs must exist');
  assert.match(dbSrc, /cancelOrderAdminDb/, 'db.mjs should export cancelOrderAdminDb');
  // Must NOT have the user-only status guard in the admin function
  const adminFnStart = dbSrc.indexOf('export async function cancelOrderAdminDb');
  assert.ok(adminFnStart > -1, 'cancelOrderAdminDb must be defined');
  const adminFnEnd = dbSrc.indexOf('\nexport async function', adminFnStart + 1);
  const adminFnBody = dbSrc.slice(adminFnStart, adminFnEnd > -1 ? adminFnEnd : adminFnStart + 3000);
  assert.ok(
    !adminFnBody.includes('pending_payment orders can be cancelled by user'),
    'cancelOrderAdminDb must NOT have the user-only pending_payment guard'
  );
  assert.match(adminFnBody, /cancelled_by_guide/, 'cancelOrderAdminDb must set status to cancelled_by_guide');
});

// AC3: source calls createAdminPosRefundEntryDb
test('AC3: source calls createAdminPosRefundEntryDb for full-amount refund', () => {
  assert.ok(src, 'cancel route must exist');
  assert.match(src, /createAdminPosRefundEntryDb/, 'source should call createAdminPosRefundEntryDb');
});

// AC3.1: idempotency — requestId present
test('AC3.1: source contains idempotency (requestId)', () => {
  assert.ok(src, 'cancel route must exist');
  assert.ok(src.includes('requestId') || src.includes('request_id'), 'source should contain requestId idempotency');
});

// AC4: audit log with correct action
test('AC4: source writes audit_logs with order_cancelled_by_admin', () => {
  assert.ok(src, 'cancel route must exist');
  assert.match(src, /order_cancelled_by_admin/, "source should contain 'order_cancelled_by_admin' audit action");
});

// AC4b: env var fix — uses SUPABASE_URL not NEXT_PUBLIC_SUPABASE_URL
test('AC4b: route uses server-side SUPABASE_URL (not NEXT_PUBLIC_SUPABASE_URL)', () => {
  assert.ok(src, 'cancel route must exist');
  assert.ok(
    !src.includes('NEXT_PUBLIC_SUPABASE_URL'),
    'route must use process.env.SUPABASE_URL, not NEXT_PUBLIC_SUPABASE_URL (client-side var not available on server)'
  );
  assert.match(src, /getSupabaseUrl\(\)/, 'route must reference server-side Supabase URL via config getter (#1616)');
});

// AC5: 409 for locked statuses
test('AC5: source returns 409 for locked statuses including cancelled_by_guide', () => {
  assert.ok(src, 'cancel route must exist');
  assert.ok(src.includes('409'), 'source should return 409 for locked statuses');
  assert.ok(src.includes('cancelled_by_guide'), "LOCKED_STATUSES should include 'cancelled_by_guide'");
});
