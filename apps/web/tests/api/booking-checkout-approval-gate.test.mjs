// 三種預約模式 — checkout 守門：request plan 未經導遊審核通過不得進付款。
// 行為由純函式 canCheckout 單測涵蓋；此處 source-contract 鎖定 checkout route 接線。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { canCheckout } from '../../src/lib/booking-type-flow.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(
  join(__dirname, '../../app/api/v2/bookings/[bookingId]/checkout/route.ts'),
  'utf8',
);

test('checkout route imports and applies canCheckout gate', () => {
  assert.match(SRC, /from '.*booking-type-flow\.mjs'/);
  assert.match(SRC, /canCheckout\(/);
});

test('checkout selects guide_approval_status and plan booking_type', () => {
  assert.match(SRC, /guide_approval_status/);
  const planSel = SRC.slice(SRC.indexOf('activity_plans ('), SRC.indexOf('activity_plans (') + 60);
  assert.match(planSel, /booking_type/);
});

test('gate returns 409 APPROVAL_REQUIRED before payment branches', () => {
  const gateIdx = SRC.indexOf('canCheckout(');
  const draftCheckIdx = SRC.indexOf("booking.status !== 'draft'");
  // gate must sit after the draft-status check
  assert.ok(gateIdx > draftCheckIdx, 'gate runs after draft check');
  const gateSlice = SRC.slice(gateIdx, gateIdx + 300);
  assert.match(gateSlice, /status:\s*409/);
  // gate must run before the order fetch / payment creation
  const orderFetchIdx = SRC.indexOf(".from('orders')");
  assert.ok(orderFetchIdx > -1 && gateIdx < orderFetchIdx, 'gate runs before order/payment logic');
});

test('canCheckout contract: request blocked unless approved', () => {
  assert.equal(canCheckout('request', 'pending').allowed, false);
  assert.equal(canCheckout('request', 'approved').allowed, true);
  assert.equal(canCheckout('instant', 'not_required').allowed, true);
});
