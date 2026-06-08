import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTE_PATH = resolve(__dirname, '../../app/api/guide/dashboard/route.ts');
const SETTLEMENT_CONFIG_PATH = resolve(__dirname, '../../src/lib/settlement-config.ts');
const routeSrc = readFileSync(ROUTE_PATH, 'utf8');
const settlementConfigSrc = readFileSync(SETTLEMENT_CONFIG_PATH, 'utf8');

test('issue631: refund source is operations_tracking, not orders.refund_amount_twd', () => {
  assert.match(routeSrc, /\.from\('operations_tracking'\)/, 'must query operations_tracking as refund source of truth');
  assert.match(routeSrc, /select\('order_id,\s*refund_amount_twd'\)/, 'must select order_id/refund_amount_twd from operations_tracking');
  assert.ok(
    !/select\('id,\s*total_twd,\s*created_at,\s*refund_amount_twd'\)/.test(routeSrc),
    'must not depend on orders.refund_amount_twd in month orders query'
  );
});

test('issue631: expectedPayoutTwd uses row-sum policy, not aggregate floor', () => {
  assert.ok(
    !routeSrc.includes('Math.floor(monthGmvTwd * (1 - settlementConfig.commission_rate))'),
    'must not use aggregate monthGmvTwd floor formula'
  );
  assert.match(
    routeSrc,
    /const expectedPayoutTwd = \(monthOrders \?\? \[\]\)\.reduce\(/,
    'expectedPayoutTwd must be computed by reducing row payouts'
  );
});

test('issue631: row policy handles partial refunds with effective_twd and floor commission via canonical helper', () => {
  // Since GH-1284, dashboard route delegates row-level commission math to
  // computeGuidePayoutEstimate in settlement-config.ts (canonical helper).
  // The route passes opsTracking + settlementConfig; the helper computes
  // effectiveTwd, commissionTwd (Math.floor), and payableNetTwd.
  assert.ok(
    routeSrc.includes('computeGuidePayoutEstimate'),
    'route must delegate per-row commission math to computeGuidePayoutEstimate'
  );
  assert.match(
    routeSrc,
    /const estimate = computeGuidePayoutEstimate\(/,
    'route must call computeGuidePayoutEstimate per order row'
  );
  assert.match(
    settlementConfigSrc,
    /effectiveTwd\s*=\s*Math\.max\(0,\s*totalTwd\s*-\s*refundAmountTwd\)/,
    'canonical helper must compute effectiveTwd = total_twd - refund_amount_twd'
  );
  assert.match(
    settlementConfigSrc,
    /commissionTwd\s*=\s*(effectiveTwd > 0\s*\n\s*\?)?\s*Math\.floor\(effectiveTwd \* config\.commission_rate\)/,
    'canonical helper must floor commission per row using commission_rate'
  );
  assert.match(
    settlementConfigSrc,
    /payableNetTwd:\s*netTwd/,
    'canonical helper must return payableNetTwd (guide net after commission)'
  );
});

test('issue631: keeps refund-aware monthGmvTwd and revenueTrend6m behavior', () => {
  assert.match(routeSrc, /const monthGmvTwd = \(monthOrders \?\? \[\]\)\.reduce\(/, 'monthGmvTwd must stay row-reduced');
  assert.match(
    routeSrc,
    /const refundAmountTwd = monthRefundAmountByOrderId\[o\.id\] \?\? 0;\s*\n\s*const effectiveTwd = Math\.max\(0, totalTwd - refundAmountTwd\);/,
    'monthGmvTwd must be refund-adjusted from operations_tracking map'
  );
  assert.match(
    routeSrc,
    /gmvTwd:\s*\(mOrders \?\? \[\]\)\.reduce\([\s\S]*mRefundAmountByOrderId\[o\.id\] \?\? 0[\s\S]*Math\.max\(0, totalTwd - refundAmountTwd\)/,
    'revenueTrend6m gmvTwd must remain refund-aware per row'
  );
});

test('issue631: fixture math expectation (before 6380 -> after 6382) is row-sum not aggregate-floor', () => {
  const commissionRate = 0.15;
  const effectiveRows = [5000, 77, 1620, 743, 10, 56];
  const rowSum = effectiveRows.reduce((sum, effectiveTwd) => sum + (effectiveTwd - Math.floor(effectiveTwd * commissionRate)), 0);
  const aggregateFloor = Math.floor(effectiveRows.reduce((a, b) => a + b, 0) * (1 - commissionRate));

  assert.equal(rowSum, 6382);
  assert.equal(aggregateFloor, 6380);
  assert.notEqual(rowSum, aggregateFloor, 'row-level floor/sum policy must differ from aggregate-floor in rounding edge cases');
});

test('issue631: refund_pending orders remain excluded from payout source set', () => {
  assert.match(
    routeSrc,
    /const gmvStatuses = \['paid', 'confirmed', 'completed'\]/,
    'dashboard payout source set must stay aligned to settlement-eligible statuses'
  );
});
