import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '..', '..');
const read = (rel) => readFileSync(join(webRoot, rel), 'utf8');

test('付款步驟：匯款選項說明祕島人工對帳時效', () => {
  const src = read('app/(non-locale)/guides/[slug]/shop/book/page.tsx');
  assert.match(src, /data-testid="shop-transfer-reconciliation-copy"/);
  assert.match(src, /匯款後由祕島人工對帳，1[–-]2 個工作天內確認並通知你/);
});

test('付款步驟：feature flag 關閉時不渲染自行匯款選項', () => {
  const src = read('app/(non-locale)/guides/[slug]/shop/book/page.tsx');
  assert.match(src, /isTransferPaymentEnabledClient/);
  assert.match(src, /isTransferPaymentEnabledClient\s*&&/);
});

test('訂單頁：匯款付款回跳時顯示等待對帳確認提示', () => {
  const src = read('app/(non-locale)/guides/[slug]/shop/orders/page.tsx');
  assert.match(src, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(src, /paid.*transfer/);
  assert.match(src, /data-testid="shop-transfer-pending"/);
  assert.match(src, /等待對帳確認/);
});
