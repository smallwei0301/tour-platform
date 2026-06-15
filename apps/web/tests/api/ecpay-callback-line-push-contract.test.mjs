import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function read(rel) {
  return fs.readFile(path.resolve(__dirname, '../..', rel), 'utf8');
}

test('ecpay callback: ops notify stays gated on source_channel=line, but traveler push fires for ANY bound traveler', async () => {
  const src = await read('app/api/payments/ecpay/callback/route.ts');
  // ops notify gate preserved (admin/guide ops group is LINE-source only)
  assert.match(src, /select\('source_channel'\)/);
  assert.match(src, /if \(sourceChannel === 'line'\)/);
  assert.match(src, /notifyPaymentReceived/);
  // per-traveler push is NOT gated by source_channel (decision: push to any bound traveler)
  assert.match(src, /凡綁定 LINE 者都推|any bound traveler/);
  assert.match(src, /pushTravelerOrderEvent/);
  assert.match(src, /payment_received/);
  // the traveler push must sit AFTER the ops source-channel block
  const opsIdx = src.indexOf("if (sourceChannel === 'line')");
  const ungatedIdx = src.indexOf('any bound traveler');
  const pushIdx = src.indexOf('payment_received');
  assert.ok(opsIdx !== -1 && ungatedIdx > opsIdx && pushIdx > ungatedIdx,
    'pushTravelerOrderEvent(payment_received) must be ungated, after the ops block');
});

test('orders route: traveler booking confirmation push is ungated (any bound traveler)', async () => {
  const src = await read('app/api/orders/route.ts');
  assert.match(src, /凡綁定 LINE 者都推|any bound traveler/);
  assert.match(src, /pushTravelerOrderEvent/);
  assert.match(src, /booking_confirmed/);
  // must not re-introduce a source-channel gate wrapping the traveler push
  assert.doesNotMatch(src, /if \(orderSourceChannel === 'line'\) \{[\s\S]*?pushTravelerOrderEvent/);
});

test('cancel route: pushes cancellation to the traveler', async () => {
  const src = await read('app/api/me/orders/[orderId]/route.ts');
  assert.match(src, /pushTravelerOrderEvent/);
  assert.match(src, /order_cancelled/);
});

test('refund-requests route: pushes refund notices to the traveler', async () => {
  const src = await read('app/api/me/orders/[orderId]/refund-requests/route.ts');
  assert.match(src, /pushTravelerOrderEvent/);
  assert.match(src, /refund_requested|refund_executed/);
});
