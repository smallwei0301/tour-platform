/**
 * RED tests for issue #371: Admin order detail — execute refund button
 *
 * AC1: "執行退款" button is shown when order.status === 'refund_pending'
 * AC2: handler calls POST /api/admin/orders/${orderId}/refund-execute and shows success message
 * AC3: cash orders (no trade_no) show a reason textarea (required)
 * AC4: already-refunded orders show "已完成退款" or disabled state when status === 'refunded'
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

const PAGE = 'app/admin/orders/page.tsx';

// ─── AC1: 執行退款 button when refund_pending ─────────────────────────────────

test('AC1: admin orders page exists and is non-empty', async () => {
  const src = await readSource(PAGE);
  assert.ok(src.length > 0, 'admin orders page must exist and be non-empty');
});

test('AC1: page conditionally renders 執行退款 button for refund_pending', async () => {
  const src = await readSource(PAGE);
  assert.match(src, /refund_pending/, 'must reference refund_pending status');
  assert.match(src, /執行退款/, 'must have 執行退款 button text');
});

test('AC1: 執行退款 button is inside a refund_pending conditional block', async () => {
  const src = await readSource(PAGE);
  // Find the JSX conditional: detail.status === 'refund_pending' ... 執行退款
  // The source must contain a pattern where refund_pending check precedes 執行退款 within 2000 chars
  assert.ok(
    /refund_pending[\s\S]{0,2000}執行退款/.test(src),
    '執行退款 must appear inside a block that checks refund_pending'
  );
});

// ─── AC2: handler calls POST /api/admin/orders/${orderId}/refund-execute ──────

test('AC2: page contains handler calling refund-execute endpoint', async () => {
  const src = await readSource(PAGE);
  assert.match(
    src,
    /refund-execute/,
    'must reference refund-execute endpoint'
  );
});

test('AC2: handler uses POST method for refund-execute', async () => {
  const src = await readSource(PAGE);
  // POST method and refund-execute should both appear
  assert.match(src, /POST[\s\S]{0,500}refund-execute|refund-execute[\s\S]{0,500}POST/, 'must call POST to refund-execute');
});

test('AC2: page shows success message after refund execution', async () => {
  const src = await readSource(PAGE);
  // Must have some success/completion indication
  assert.ok(
    src.includes('退款已執行') || src.includes('refundExecuted') || src.includes('退款完成'),
    'must show success message after executing refund'
  );
});

// ─── AC3: cash order reason textarea ─────────────────────────────────────────

test('AC3: page contains textarea or input for reason (cash orders)', async () => {
  const src = await readSource(PAGE);
  assert.match(src, /textarea|refundReason/, 'must have textarea or reason state for cash orders');
});

test('AC3: page references trade_no for cash order detection', async () => {
  const src = await readSource(PAGE);
  assert.match(src, /trade_no/, 'must check trade_no for cash order handling');
});

test('AC3: page has reason state variable for cash orders', async () => {
  const src = await readSource(PAGE);
  assert.match(src, /refundReason|reason/, 'must have reason/refundReason state variable');
});

// ─── AC4: already-refunded state shows 已完成退款 ────────────────────────────

test('AC4: page shows 已完成退款 when status is refunded', async () => {
  const src = await readSource(PAGE);
  assert.match(src, /已完成退款/, 'must show 已完成退款 for refunded orders');
});

test('AC4: 已完成退款 is associated with the refunded status check', async () => {
  const src = await readSource(PAGE);
  const refundedStatusIdx = src.lastIndexOf("=== 'refunded'");
  const alreadyRefundedIdx = src.indexOf('已完成退款');
  assert.ok(
    refundedStatusIdx !== -1,
    "must have === 'refunded' status check"
  );
  assert.ok(
    alreadyRefundedIdx !== -1,
    'must have 已完成退款 text'
  );
  // Should be within 500 chars of each other
  assert.ok(
    Math.abs(refundedStatusIdx - alreadyRefundedIdx) < 500,
    '已完成退款 must be near the refunded status check'
  );
});

test('AC4: page has isExecutingRefund or disabled state for the execute button', async () => {
  const src = await readSource(PAGE);
  assert.match(src, /isExecutingRefund|disabled/, 'must have disabled state for execute button');
});
