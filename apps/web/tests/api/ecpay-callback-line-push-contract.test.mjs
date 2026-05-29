import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function read(rel) {
  return fs.readFile(path.resolve(__dirname, '../..', rel), 'utf8');
}

test('ecpay callback: per-traveler push stays gated on source_channel=line', async () => {
  const src = await read('app/api/payments/ecpay/callback/route.ts');
  // existing gate preserved
  assert.match(src, /select\('source_channel'\)/);
  assert.match(src, /if \(sourceChannel === 'line'\)/);
  // new: pushes payment confirmation to the traveler inside the line block
  assert.match(src, /pushTravelerOrderEvent/);
  assert.match(src, /payment_received/);
});

test('orders route: pushes booking confirmation for line-sourced orders', async () => {
  const src = await read('app/api/orders/route.ts');
  assert.match(src, /pushTravelerOrderEvent/);
  assert.match(src, /booking_confirmed/);
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
