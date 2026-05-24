import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DETAIL_ROUTE = path.join(
  ROOT,
  'app/api/v2/admin/pos/bookings/[bookingId]/route.ts'
);

test('admin POS order detail timeline route exists and uses shared primitives', async () => {
  const src = await readFile(DETAIL_ROUTE, 'utf8');

  assert.match(src, /from\('bookings'\)/);
  assert.match(src, /from\('orders'\)/);
  assert.match(src, /from\('booking_status_logs'\)/);
  assert.match(src, /from\('payments'\)/);
  assert.match(src, /from\('payment_events'\)/);
  assert.match(src, /from\('refund_requests'\)/);
  assert.match(src, /from\('audit_logs'\)/);
  assert.match(src, /timeline\.sort\(/);
});
