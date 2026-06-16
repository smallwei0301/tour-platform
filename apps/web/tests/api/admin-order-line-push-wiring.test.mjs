import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Source-contract: the three admin order-mutation routes fan out LINE push to
// traveler + guide (in addition to the existing Telegram dispatch). The push
// helpers self-gate on the notification matrix + bindings + env flags, so no
// extra guards are needed at the call site.

const here = dirname(fileURLToPath(import.meta.url));
const ADMIN = join(here, '..', '..', 'app', 'api', 'admin', 'orders', '[orderId]');

function read(p) {
  return readFileSync(p, 'utf8');
}

test('admin PATCH status route pushes LINE to traveler + guide', () => {
  const src = read(join(ADMIN, 'route.ts'));
  assert.match(src, /pushTravelerOrderEvent/);
  assert.match(src, /pushGuideOrderEvent/);
  // guide kind is prefixed for the guide-facing message builder
  assert.match(src, /guide_\$\{kind\}/);
});

test('admin cancel route pushes LINE to traveler + guide', () => {
  const src = read(join(ADMIN, 'cancel', 'route.ts'));
  assert.match(src, /pushTravelerOrderEvent[\s\S]*kind: 'order_cancelled'/);
  assert.match(src, /pushGuideOrderEvent[\s\S]*kind: 'guide_order_cancelled'/);
});

test('admin refund-execute route pushes LINE only inside the 200 success branch', () => {
  const src = read(join(ADMIN, 'refund-execute', 'route.ts'));
  assert.match(src, /outcome\.status === 200/);
  const successBlock = src.slice(src.indexOf('outcome.status === 200'));
  assert.match(successBlock, /pushTravelerOrderEvent[\s\S]*kind: 'refund_executed'/);
  assert.match(successBlock, /pushGuideOrderEvent[\s\S]*kind: 'guide_refund_executed'/);
});
