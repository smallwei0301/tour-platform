// #1493 — 旅客/後台付款期限 UI source-contract（node lane；瀏覽器行為另由 e2e spec 驗）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

test('me/orders 顯示付款期限 banner + 前往付款 + cancelled_unpaid 色票', () => {
  const src = read('app/me/orders/page.tsx');
  assert.match(src, /describePaymentRemaining/);
  assert.match(src, /order-payment-deadline/);
  assert.match(src, /order-resume-payment/);
  assert.match(src, /paymentDeadlineAt/);
  assert.match(src, /cancelled_unpaid/);
  assert.match(src, /m\.resumePayment/);
});

test('admin/orders 詳情顯示付款期限/剩餘時間 + 逾時取消', () => {
  const src = read('app/admin/orders/page.tsx');
  assert.match(src, /describePaymentRemaining/);
  assert.match(src, /admin-order-payment-deadline/);
  assert.match(src, /cancelled_unpaid/);
  assert.match(src, /已逾時自動取消/);
});

test('admin StatusBadge 有 cancelled_unpaid 標籤', () => {
  const src = read('src/components/admin/ui.tsx');
  assert.match(src, /cancelled_unpaid:\s*\{ variant: 'danger',\s*label: '逾時自動取消' \}/);
});

test('i18n（zh-Hant / en）含 cancelled_unpaid 與付款期限文案', () => {
  const zh = JSON.parse(read('messages/zh-Hant.json'));
  assert.equal(zh.orders.status.cancelled_unpaid, '已逾時自動取消');
  assert.equal(zh.orders.resumePayment, '前往付款');
  assert.ok(zh.orderDetail.statusDesc.cancelled_unpaid);
  const en = JSON.parse(read('messages/en.json'));
  assert.ok(en.orders.status.cancelled_unpaid);
  assert.ok(en.orders.resumePayment);
});
