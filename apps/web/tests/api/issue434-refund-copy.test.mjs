/**
 * Contract test: issue #434 — align refund status copy for REFUND_AUTO_EXECUTE=true path
 *
 * Asserts that the traveler-facing order detail page uses:
 *  - refunded: confirms completion and references original payment instrument (no manual-review implication)
 *  - refund_pending: neutral language (no manual-review implication)
 *
 * Strategy: readFileSync the source file and assert on string content.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORDER_DETAIL_PAGE = join(
  __dirname,
  '../../app/me/orders/[orderId]/page.tsx'
);
// #multilingual: 狀態描述文案已從 page 的 STATUS_DESCRIPTIONS 移到
// messages/zh-Hant.json 的 orderDetail.statusDesc namespace。文案內容契約改讀繁中 catalog。
const ZH_MESSAGES = join(__dirname, '../../messages/zh-Hant.json');

let src;
try {
  src = readFileSync(ORDER_DETAIL_PAGE, 'utf8');
} catch {
  src = null;
}

let statusDescBlock;
try {
  statusDescBlock = JSON.stringify(
    JSON.parse(readFileSync(ZH_MESSAGES, 'utf8')).orderDetail.statusDesc
  );
} catch {
  statusDescBlock = null;
}

test('order detail page source exists', () => {
  assert.ok(src !== null, `order detail page should exist at ${ORDER_DETAIL_PAGE}`);
});

// Status descriptions now live in messages/zh-Hant.json → orderDetail.statusDesc.
function extractStatusDescriptions() {
  return statusDescBlock ?? '';
}

test('refunded copy does NOT contain 等待人工審核', () => {
  assert.ok(src, 'page source must exist');
  const block = extractStatusDescriptions(src);
  assert.ok(
    !block.includes('等待人工審核'),
    'STATUS_DESCRIPTIONS must NOT contain 等待人工審核 (implies manual review, wrong for auto-execute path)'
  );
});

test('refunded copy does NOT contain 等待人工', () => {
  assert.ok(src, 'page source must exist');
  const block = extractStatusDescriptions(src);
  assert.ok(
    !block.includes('等待人工'),
    'STATUS_DESCRIPTIONS must NOT contain 等待人工 (implies manual review)'
  );
});

test('refunded copy DOES confirm completion (退款已完成 or 退款已成立)', () => {
  assert.ok(src, 'page source must exist');
  const block = extractStatusDescriptions(src);
  const hasCompletion = block.includes('退款已完成') || block.includes('退款已成立');
  assert.ok(
    hasCompletion,
    'refunded description should confirm completion with 退款已完成 or 退款已成立'
  );
});

test('refunded copy references original payment instrument (原付款工具)', () => {
  assert.ok(src, 'page source must exist');
  const block = extractStatusDescriptions(src);
  assert.ok(
    block.includes('原付款工具'),
    'refunded description should reference 原付款工具 (original payment instrument) for auto-execute path clarity'
  );
});

test('refund_pending copy does NOT contain 等待人工審核', () => {
  assert.ok(src, 'page source must exist');
  const block = extractStatusDescriptions(src);
  assert.ok(
    !block.includes('等待人工審核'),
    'STATUS_DESCRIPTIONS must NOT contain 等待人工審核'
  );
});

test('refund_pending copy uses neutral language (處理中 or 受理)', () => {
  assert.ok(src, 'page source must exist');
  const block = extractStatusDescriptions(src);
  const hasNeutral = block.includes('處理中') || block.includes('受理');
  assert.ok(
    hasNeutral,
    'refund_pending description should use neutral language: 處理中 or 受理'
  );
});
