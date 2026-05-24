/**
 * Issue #719: Monthly payout routes use DB-backed settlement_rules
 * Contract tests (readFileSync + assert.match) — no live DB required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const JSON_ROUTE = path.join(ROOT, 'app/api/guide/payout/monthly/route.ts');
const CSV_ROUTE = path.join(ROOT, 'app/api/guide/payout/monthly/csv/route.ts');

const routes = [
  { label: 'JSON route', file: JSON_ROUTE },
  { label: 'CSV route', file: CSV_ROUTE },
];

// ── Both routes: import getSettlementConfig, not SETTLEMENT_COMMISSION_RATE ──

for (const { label, file } of routes) {
  test(`${label} imports getSettlementConfig from settlement-config`, () => {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /getSettlementConfig/, `${label}: getSettlementConfig import not found`);
    assert.match(src, /settlement-config/, `${label}: settlement-config module not imported`);
  });

  test(`${label} does NOT import SETTLEMENT_COMMISSION_RATE`, () => {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /SETTLEMENT_COMMISSION_RATE/, `${label}: must not use static SETTLEMENT_COMMISSION_RATE constant`);
  });

  // ── Both routes: call getSettlementConfig(supabase) ──

  test(`${label} calls getSettlementConfig(supabase)`, () => {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /getSettlementConfig\(supabase\)/, `${label}: getSettlementConfig(supabase) call not found`);
  });

  // ── Both routes: use settlementConfig.commission_rate in Math.floor ──

  test(`${label} uses settlementConfig.commission_rate in commission calculation`, () => {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /effectiveTwd \* settlementConfig\.commission_rate/, `${label}: commission_rate from settlementConfig not used`);
  });

  // ── Both routes: refund/effective-amount guard is still present ──

  test(`${label} still has refund_amount_twd guard`, () => {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /refund_amount_twd/, `${label}: refund_amount_twd query missing`);
    assert.match(src, /effectiveTwd/, `${label}: effectiveTwd computation missing`);
  });
}

// ── JSON route: includes settlementRulesVersion in response ──

test('JSON route includes settlementRulesVersion in response object', () => {
  const src = readFileSync(JSON_ROUTE, 'utf8');
  assert.match(src, /settlementRulesVersion/, 'JSON route must include settlementRulesVersion in response');
  assert.match(src, /settlementConfig\.version/, 'JSON route must read version from settlementConfig');
});

// ── CSV route: sets X-Settlement-Rule-Version response header ──

test('CSV route sets X-Settlement-Rule-Version header', () => {
  const src = readFileSync(CSV_ROUTE, 'utf8');
  assert.match(src, /X-Settlement-Rule-Version/, 'CSV route must set X-Settlement-Rule-Version header');
  assert.match(src, /settlementConfig\.version/, 'CSV route must read version from settlementConfig');
});

test('CSV route does not add a trailing version row to CSV body', () => {
  const src = readFileSync(CSV_ROUTE, 'utf8');
  // The version info must only appear in the Response headers object, not appended to csvContent.
  // Check that there is no line appending settlementConfig.version to the CSV string itself.
  assert.doesNotMatch(src, /csvContent\s*\+=.*version|csvContent\s*=\s*csvContent.*version.*\\n/,
    'CSV route must not inject version info into the CSV body string');
  // Ensure X-Settlement-Rule-Version is inside a headers block (not in a CSV row template)
  assert.match(src, /'X-Settlement-Rule-Version'\s*:/,
    'CSV route must set X-Settlement-Rule-Version in the Response headers object');
});
