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

// legacy orders route 的建單 hook 已隨 #1407 刪除（該 route 在 prod 早被 410 gate 擋死，
// 建單通知實際未派發）；V2 鏈的建單/付款通知由 ecpay callback 統一派發，V2 建單即時通知另案追蹤。

test('cancel route: pushes cancellation to the traveler', async () => {
  const src = await read('app/api/v2/orders/[orderId]/cancel/route.ts');
  assert.match(src, /pushTravelerOrderEvent/);
  assert.match(src, /order_cancelled/);
});

test('refund-requests route: pushes refund notices to the traveler', async () => {
  const src = await read('app/api/v2/orders/[orderId]/refund-requests/route.ts');
  assert.match(src, /pushTravelerOrderEvent/);
  assert.match(src, /refund_requested|refund_executed/);
});

test('per-guide push is wired into all order hooks (post-#1407: callback/cancel/refund)', async () => {
  const sites = [
    ['app/api/payments/ecpay/callback/route.ts', /guide_payment_received/],
    ['app/api/v2/orders/[orderId]/cancel/route.ts', /guide_order_cancelled/],
    ['app/api/v2/orders/[orderId]/refund-requests/route.ts', /guide_refund_requested|guide_refund_executed/],
  ];
  for (const [rel, kindRe] of sites) {
    const src = await read(rel);
    assert.match(src, /pushGuideOrderEvent/, `${rel} should call pushGuideOrderEvent`);
    assert.match(src, kindRe, `${rel} should send the right guide kind`);
  }
});
