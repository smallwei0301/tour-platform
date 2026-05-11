/**
 * RED tests for issue #345: Polish refund request UI on /me/orders/[orderId]
 *
 * AC#1: Button shown ONLY when status is paid/confirmed AND departure not yet passed
 * AC#2: Submit form (reason + note) → idempotent POST → success message
 * AC#3: Terminal states → button hidden + status copy shown
 * AC#4: Duplicate submission → idempotent (same requestId)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

// ─── AC#1: departure-aware button visibility ──────────────────────────────────

test('OrderDetail type includes scheduleStartAt for departure-date check', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  assert.match(src, /scheduleStartAt\?:\s*string\s*\|\s*null/,
    'OrderDetail type must declare scheduleStartAt field');
});

test('canRefund is false when departure has already passed', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  // Must guard departure: either canRefund directly references scheduleStartAt,
  // or an intermediate variable (e.g. departureNotPassed) references it and
  // is then used in canRefund
  const hasDirectGuard = /canRefund\s*=[\s\S]{0,200}scheduleStartAt/.test(src);
  const hasDepartureVar = /departureNotPassed[\s\S]{0,20}scheduleStartAt/.test(src) &&
                          /canRefund[\s\S]{0,100}departureNotPassed/.test(src);
  assert.ok(hasDirectGuard || hasDepartureVar,
    'canRefund logic must reference scheduleStartAt for departure-date guard (direct or via intermediate)');
});

test('canRefund is true for paid/confirmed orders with future departure', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  // Must check paid or confirmed status
  assert.match(src, /\[['"]paid['"],\s*['"]confirmed['"]\]\.includes\(status\)/,
    "canRefund must check status === 'paid' or 'confirmed'");
});

// ─── AC#2: form has reason + note fields, shows correct success copy ──────────

test('refund form has a reason select/input AND a note textarea', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  assert.match(src, /refundNote/,
    'page must have refundNote state for the note field');
  assert.match(src, /refundReason/,
    'page must have refundReason state');
  assert.match(src, /note.*refundNote|refundNote.*note/s,
    'POST body must send note field');
});

test('success message says "已申請，客服將於 2 個工作天內處理"', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  assert.match(src, /已申請，客服將於\s*2\s*個工作天內處理/,
    'success copy must read "已申請，客服將於 2 個工作天內處理"');
});

// ─── AC#3: terminal states show status copy, hide button ─────────────────────

test('refund_pending status is treated as terminal (button hidden)', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  // refund_pending should be in terminal set OR canRefund guards it via status check
  assert.match(
    src,
    /refund_pending[\s\S]{0,60}(isTerminal|canRefund)|canRefund[\s\S]{0,200}refund_pending/,
    'refund_pending must be excluded from canRefund or included in terminal set'
  );
});

test('申請取消/退款 is the button label', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  assert.match(src, /申請取消\/退款|申請取消.退款/,
    'button label must be "申請取消/退款"');
});

// ─── AC#4: POST sends a stable requestId for idempotency ─────────────────────

test('refund POST uses a stable per-session requestId (stored in state)', async () => {
  const src = await readSource('app/me/orders/[orderId]/page.tsx');
  // requestId must be stored in useState, not generated fresh on every submit
  assert.match(src, /useState\s*\(\s*['"]{0,1}\s*['"]{0,1}\s*\)/,
    'page should use useState for requestId or another stable id');
  assert.match(src, /requestId/,
    'POST body must include requestId for idempotency');
});
