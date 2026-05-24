import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MANUAL_PAYMENT_ROUTE = path.join(
  ROOT,
  'app/api/v2/admin/pos/bookings/[bookingId]/manual-payment/route.ts'
);

test('admin POS manual payment route exists and writes shared primitives only', async () => {
  const src = await readFile(MANUAL_PAYMENT_ROUTE, 'utf8');

  assert.match(src, /from\('payments'\)[\s\S]*?\.insert\(/);
  assert.match(src, /from\('payment_events'\)[\s\S]*?\.insert\(/);
  assert.match(src, /updateAdminOrderDb\(/);
  assert.match(src, /BookingStateService/);
  assert.match(src, /bookingStateService\.paymentReceived\(/);
  assert.match(src, /sourceChannel:\s*'admin_pos'/);
});

test('manual payment route keeps availability refresh integration through admin order update path', async () => {
  const src = await readFile(MANUAL_PAYMENT_ROUTE, 'utf8');
  assert.match(src, /updateAdminOrderDb\(\{[\s\S]*status:\s*'paid'/);
});
