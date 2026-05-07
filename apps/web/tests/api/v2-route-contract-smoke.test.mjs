import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readRoute(relPath) {
  const full = path.join(ROOT, relPath);
  return readFile(full, 'utf8');
}

test('available-slots route contract smoke: has validation + success/error envelope', async () => {
  const src = await readRoute('app/api/v2/activities/[activityId]/available-slots/route.ts');

  assert.match(src, /export\s+async\s+function\s+GET\s*\(/);
  assert.match(src, /parseAndValidateParams\(/);
  assert.match(src, /code:\s*'VALIDATION_ERROR'/);
  assert.match(src, /errorV2\('NOT_FOUND'/);
  assert.match(src, /successV2\(/);
  assert.match(src, /slots:\s*result\.slots/);
});

test('booking draft route contract smoke: has validation + stateful errors + success envelope', async () => {
  const src = await readRoute('app/api/v2/bookings/draft/route.ts');

  assert.match(src, /export\s+async\s+function\s+POST\s*\(/);
  assert.match(src, /parseAndValidateBody\(/);
  assert.match(src, /errorV2\('VALIDATION_ERROR'/);
  assert.match(src, /errorV2\('NOT_FOUND'/);
  assert.match(src, /errorV2\('CAPACITY_EXCEEDED'/);
  assert.match(src, /errorV2\('SLOT_UNAVAILABLE'/);
  assert.match(src, /successV2\(/);
  assert.match(src, /bookingId:/);
  assert.match(src, /orderId:/);
  assert.match(src, /from\('order_items'\)\.insert\([\s\S]*booking_id:\s*bookingInsert\.id/);
});

test('checkout route contract smoke: has bookingId validation + provider flow + success envelope', async () => {
  const src = await readRoute('app/api/v2/bookings/[bookingId]/checkout/route.ts');

  assert.match(src, /export\s+async\s+function\s+POST\s*\(/);
  assert.match(src, /Invalid bookingId/);
  assert.match(src, /errorV2\('VALIDATION_ERROR'/);
  assert.match(src, /errorV2\('NOT_FOUND'/);
  assert.match(src, /'INVALID_STATE_TRANSITION'/);
  assert.match(src, /successV2\(/);
  assert.match(src, /paymentFormHtml/);
  assert.match(src, /merchantTradeNo/);
});

test('v2 order detail route contract smoke: has auth guard + ownership check', async () => {
  const src = await readRoute('app/api/v2/orders/[orderId]/route.ts');

  assert.match(src, /export\s+async\s+function\s+GET\s*\(/);
  assert.match(src, /auth\.getUser\(\)/);
  assert.match(src, /UNAUTHORIZED/);
  assert.match(src, /FORBIDDEN/);
  assert.match(src, /user_id/);
  assert.match(src, /isOrderOwner/);
});
