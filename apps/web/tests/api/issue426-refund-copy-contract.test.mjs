import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PAGE_PATH = path.join(ROOT, 'app/(non-locale)/me/orders/[orderId]/page.tsx');
// #multilingual: 狀態描述文案已移到 messages/zh-Hant.json 的 orderDetail.statusDesc。
// 文案內容契約改讀（page + 繁中 catalog）。
const ZH_PATH = path.join(ROOT, 'messages/zh-Hant.json');
const readCopy = () => readFileSync(PAGE_PATH, 'utf8') + '\n' + readFileSync(ZH_PATH, 'utf8');

// AC1 — refund_pending description uses neutral copy (no wait-hint language)
test('AC1: refund_pending copy is neutral — contains 退款申請已受理，處理中', () => {
  const src = readCopy();
  assert.match(
    src,
    /退款申請已受理，處理中/,
    'refund_pending description must use neutral "已受理，處理中" phrasing'
  );
});

// AC2 — old misleading copy is gone
test('AC2: old wait-hint copy removed — does NOT contain 請耐心等候', () => {
  const src = readCopy();
  assert.doesNotMatch(
    src,
    /請耐心等候/,
    'refund_pending description must NOT contain old "請耐心等候" text'
  );
});

// AC3 — refunded copy already accurate — must contain 退款已完成
test('AC3: refunded copy is accurate — contains 退款已完成', () => {
  const src = readCopy();
  assert.match(
    src,
    /退款已完成/,
    'refunded description must contain "退款已完成"'
  );
});
