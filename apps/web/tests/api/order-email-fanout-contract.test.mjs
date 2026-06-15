import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFile(path.resolve(__dirname, '../..', rel), 'utf8');

test('guide+admin order emails are dispatched from all four order hooks', async () => {
  const sites = [
    ['app/api/orders/route.ts', /new_order/],
    ['app/api/payments/ecpay/callback/route.ts', /payment_received/],
    ['app/api/me/orders/[orderId]/route.ts', /order_cancelled/],
    ['app/api/me/orders/[orderId]/refund-requests/route.ts', /refund_requested|refund_executed/],
  ];
  for (const [rel, kindRe] of sites) {
    const src = await read(rel);
    assert.match(src, /dispatchOrderEventEmails/, `${rel} should call dispatchOrderEventEmails`);
    assert.match(src, kindRe, `${rel} should pass the right kind`);
  }
});

test('payment hook does not double-email admins (includeAdmin: false)', async () => {
  const src = await read('app/api/payments/ecpay/callback/route.ts');
  // existing admin payment email is preserved
  assert.match(src, /sendAdminPaymentNotification/);
  // and the fan-out opts out of the admin email for the payment event
  assert.match(src, /includeAdmin:\s*false/);
});

test('admin Telegram order notify is dispatched from all four order hooks', async () => {
  const sites = [
    'app/api/orders/route.ts',
    'app/api/payments/ecpay/callback/route.ts',
    'app/api/me/orders/[orderId]/route.ts',
    'app/api/me/orders/[orderId]/refund-requests/route.ts',
  ];
  for (const rel of sites) {
    const src = await read(rel);
    assert.match(src, /dispatchOrderEventTelegram/, `${rel} should call dispatchOrderEventTelegram`);
  }
});
