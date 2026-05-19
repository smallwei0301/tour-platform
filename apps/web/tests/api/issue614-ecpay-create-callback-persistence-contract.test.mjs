import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const createRoute = readFileSync(join(__dirname, '../../app/api/payments/ecpay/create/route.ts'), 'utf8');
const callbackRoute = readFileSync(join(__dirname, '../../app/api/payments/ecpay/callback/route.ts'), 'utf8');
const dbLib = readFileSync(join(__dirname, '../../src/lib/db.mjs'), 'utf8');

test('create route persists pending payment attempt before returning form params', () => {
  assert.match(createRoute, /upsertEcpayPaymentAttemptDb\(/);
  assert.match(createRoute, /merchantTradeNo/);
  assert.match(createRoute, /amountTwd:\s*Number\(order\.totalTwd\s*\|\|\s*0\)/);
});

test('create route uses canonical custom fields: CustomField2=orderId and CustomField4=email', () => {
  assert.match(createRoute, /CustomField2:\s*orderId/);
  assert.match(createRoute, /CustomField4:\s*order\.contactEmail\s*\|\|\s*''/);
});

test('callback DB path forwards merchant_trade_no/provider into callback RPC', () => {
  assert.match(dbLib, /p_merchant_trade_no:\s*merchantTradeNo/);
  assert.match(dbLib, /p_provider:\s*'ecpay'/);
});

test('callback DB path inserts callback_paid payment_events idempotently', () => {
  assert.match(dbLib, /event_type:\s*'callback_paid'/);
  assert.match(dbLib, /insertCallbackEventError\.code\s*!==\s*'23505'/);
  assert.match(dbLib, /\.from\('payment_events'\)/);
});

test('callback route records sanitized incidents for key failure paths', () => {
  assert.match(callbackRoute, /missing_order_id/);
  assert.match(callbackRoute, /invalid_checkmac/);
  assert.match(callbackRoute, /non_success_rtn_code/);
  assert.match(callbackRoute, /db_processing_error/);
  assert.match(callbackRoute, /sanitizeRtnCode/);
  assert.match(callbackRoute, /sanitizeRtnMsg/);
});
