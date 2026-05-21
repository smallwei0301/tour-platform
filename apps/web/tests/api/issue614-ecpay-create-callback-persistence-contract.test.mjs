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

test('create DB upsert payload avoids legacy payments.method column dependency', () => {
  const fnBlock = dbLib.match(/export async function upsertEcpayPaymentAttemptDb\(input = \{\}\) \{[\s\S]*?\n\}/);
  assert.ok(fnBlock, 'upsertEcpayPaymentAttemptDb function block should exist');
  assert.doesNotMatch(fnBlock[0], /\bmethod\s*:\s*['\"]credit_card['\"]/);
});

test('callback DB path resolves payment attempt by provider identity before fallback', () => {
  assert.match(dbLib, /if \(merchantTradeNo\)\s*{[\s\S]*\.eq\('merchant_trade_no', merchantTradeNo\)/);
  assert.match(dbLib, /else if \(tradeNo\)\s*{[\s\S]*\.eq\('trade_no', tradeNo\)/);
  assert.match(dbLib, /else \{[\s\S]*\.order\('created_at', \{ ascending: false \}\)\.limit\(1\)/);
});

test('callback DB path inserts callback_paid payment_events idempotently by provider/event/order/trade identity', () => {
  assert.match(dbLib, /\.eq\('provider', 'ecpay'\)/);
  assert.match(dbLib, /\.eq\('event_type', 'callback_paid'\)/);
  assert.match(dbLib, /\.eq\('order_id', orderId\)/);
  assert.match(dbLib, /merchantTradeNo\s*\?\s*paidEventQuery\.eq\('merchant_trade_no', merchantTradeNo\)\s*:\s*paidEventQuery\.is\('merchant_trade_no', null\)/);
  assert.match(dbLib, /tradeNo\s*\?\s*paidEventQuery\.eq\('trade_no', tradeNo\)\s*:\s*paidEventQuery\.is\('trade_no', null\)/);
  assert.match(dbLib, /insertCallbackEventError\.code\s*!==\s*'23505'/);
});

test('callback route records sanitized incidents for key failure paths', () => {
  assert.match(callbackRoute, /missing_order_id/);
  assert.match(callbackRoute, /invalid_checkmac/);
  assert.match(callbackRoute, /non_success_rtn_code/);
  assert.match(callbackRoute, /db_processing_error/);
  assert.match(callbackRoute, /sanitizeRtnCode/);
  assert.match(callbackRoute, /sanitizeRtnMsg/);
});
