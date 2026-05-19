import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ecpayLib = readFileSync(join(__dirname, '../../src/lib/ecpay.ts'), 'utf8');
const reconciliationLib = readFileSync(join(__dirname, '../../src/lib/payment-reconciliation.ts'), 'utf8');
const route = readFileSync(join(__dirname, '../../app/api/internal/payments/ecpay-reconcile/route.ts'), 'utf8');

test('queryTradeInfo helper uses canonical CheckMac generation path', () => {
  assert.match(ecpayLib, /requestPayload\.CheckMacValue\s*=\s*generateCheckMacValue\(requestPayload, hashKey, hashIV\)/);
  assert.match(ecpayLib, /Cashier\/QueryTradeInfo\/V5/);
});

test('queryTradeInfo helper persists only sanitized payload shape', () => {
  assert.match(ecpayLib, /sanitizeQueryTradeInfoPayload/);
  assert.match(ecpayLib, /RtnCode/);
  assert.match(ecpayLib, /RtnMsg/);
  assert.doesNotMatch(ecpayLib, /last_provider_query_payload:\s*query\.raw/);
});

test('reconciliation maps provider-paid response to callback processor and provider_reconciled_paid event', () => {
  assert.match(reconciliationLib, /rtnCode === '1' && tradeStatus === '1'/);
  assert.match(reconciliationLib, /processPaymentCallbackDb\(/);
  assert.match(reconciliationLib, /event_type:\s*'provider_reconciled_paid'/);
});

test('reconciliation idempotency checks existing provider_reconciled_paid event before insert', () => {
  assert.match(reconciliationLib, /\.eq\('event_type', 'provider_reconciled_paid'\)/);
  assert.match(reconciliationLib, /if \(existing\) return;/);
  assert.match(reconciliationLib, /insertError\.code !== '23505'/);
});

test('unpaid or unknown query response does not mark payment as paid', () => {
  assert.match(reconciliationLib, /if \(!isProviderPaid\(query\)\) \{[\s\S]*outcome:\s*'noop_unpaid_or_unknown'[\s\S]*continue;/);
});

test('query failure is surfaced with sanitized diagnostics and incident path', () => {
  assert.match(reconciliationLib, /outcome:\s*'query_failed'/);
  assert.match(reconciliationLib, /recordIncident\(/);
  assert.match(reconciliationLib, /sanitizeDiagnostics/);
});

test('internal reconciliation route is token-guarded and returns summary', () => {
  assert.match(route, /x-internal-token/);
  assert.match(route, /INTERNAL_ALERT_TOKEN/);
  assert.match(route, /summary/);
});
