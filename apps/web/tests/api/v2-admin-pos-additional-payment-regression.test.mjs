import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ADDITIONAL_PAYMENT_ROUTE = path.join(
  ROOT,
  'app/api/v2/admin/pos/orders/[orderId]/additional-payment/route.ts'
);

test('admin POS additional-payment route exists', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.ok(src.length > 0, 'route file should not be empty');
});

test('admin POS additional-payment route is a POST endpoint', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.match(src, /export\s+async\s+function\s+POST\s*\(/);
});

test('admin POS additional-payment route validates orderId as UUID', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.match(src, /Invalid orderId/);
  assert.match(src, /isValidUuid/);
});

test('admin POS additional-payment route validates amount as positive integer', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.match(src, /amount must be a positive integer/);
  assert.match(src, /Number\.isInteger\(amount\)/);
  assert.match(src, /amount <= 0/);
});

test('admin POS additional-payment route validates method field', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.match(src, /VALID_METHODS/);
  assert.match(src, /method must be one of/);
});

test('admin POS additional-payment route uses shared db primitives', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.match(src, /from\('payments'\)[\s\S]*?\.insert\(/);
  assert.match(src, /from\('payment_events'\)[\s\S]*?\.insert\(/);
  assert.match(src, /from\('audit_logs'\)[\s\S]*?\.insert\(/);
  assert.match(src, /getAdminOrderDetailDb\(/);
});

test('admin POS additional-payment route tags channel as admin_pos', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.match(src, /sourceChannel:\s*'admin_pos'/);
});

test('admin POS additional-payment route enforces allowed order statuses', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.match(src, /ALLOWED_STATUSES/);
  assert.match(src, /INVALID_STATE_TRANSITION/);
  // Must allow paid/confirmed/completed orders (not just pending_payment)
  assert.match(src, /'paid'[\s\S]*?'confirmed'[\s\S]*?'completed'/);
});

test('admin POS additional-payment route returns success envelope with paymentId and amount', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.match(src, /successV2\(/);
  assert.match(src, /paymentId:/);
  assert.match(src, /amount,/);
  assert.match(src, /tradeNo,/);
  assert.match(src, /paidAt,/);
});

test('admin POS additional-payment route returns NOT_FOUND when order missing', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.match(src, /errorV2\('NOT_FOUND', 'Order not found'\)/);
});

test('admin POS additional-payment route does not call BookingStateService (order-centric flow)', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.doesNotMatch(src, /BookingStateService/);
  assert.doesNotMatch(src, /paymentReceived\(/);
});

test('admin POS additional-payment route tags paymentType as additional_payment in raw_payload', async () => {
  const src = await readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8');
  assert.match(src, /paymentType:\s*'additional_payment'/);
});
