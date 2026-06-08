/**
 * Issue #393: Guide dashboard monthly payout detail drawer
 * Contract test (readFileSync + assert.match pattern).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const PAYOUT_ROUTE = path.join(ROOT, 'app/api/guide/payout/monthly/route.ts');
const DASHBOARD_PAGE = path.join(ROOT, 'app/guide/dashboard/page.tsx');

// ── Route: only GET and dynamic exported ────────────────────────────────────

test('route exports GET handler', () => {
  const src = readFileSync(PAYOUT_ROUTE, 'utf8');
  assert.match(src, /export async function GET/, 'GET handler not exported from route');
});

test('route exports dynamic (force-dynamic)', () => {
  const src = readFileSync(PAYOUT_ROUTE, 'utf8');
  assert.match(src, /export const dynamic/, 'dynamic export missing from route');
});

test('route does not export non-route utilities or types', () => {
  const src = readFileSync(PAYOUT_ROUTE, 'utf8');
  // Only GET and dynamic should be named exports
  const exports = [...src.matchAll(/^export\s+(async\s+function|const|function|type|interface|class)\s+(\w+)/gm)]
    .map(m => m[2]);
  const allowedExports = new Set(['GET', 'dynamic']);
  for (const name of exports) {
    assert.ok(allowedExports.has(name), `Unexpected export from route file: ${name}`);
  }
});

// ── Route: imports getSettlementConfig ───────────────────────────────────────

test('route imports getSettlementConfig from settlement-config', () => {
  const src = readFileSync(PAYOUT_ROUTE, 'utf8');
  assert.match(src, /getSettlementConfig/, 'getSettlementConfig not imported in route');
  assert.match(src, /settlement-config/, 'settlement-config not imported in route');
  assert.doesNotMatch(src, /SETTLEMENT_COMMISSION_RATE/, 'route must not use static SETTLEMENT_COMMISSION_RATE constant');
});

// ── Route: validates month param ─────────────────────────────────────────────

test('route validates month param format', () => {
  const src = readFileSync(PAYOUT_ROUTE, 'utf8');
  assert.match(src, /month/, 'month param not referenced in route');
  // Should have a regex validation
  assert.match(src, /\d{4}/, 'month format validation pattern not found in route');
  assert.match(src, /INVALID_PARAM|400/, 'INVALID_PARAM or 400 response not found for bad month');
});

// ── Route: uses verifyGuideSession ───────────────────────────────────────────

test('route uses verifyGuideSession for auth', () => {
  const src = readFileSync(PAYOUT_ROUTE, 'utf8');
  assert.match(src, /verifyGuideSession/, 'verifyGuideSession not used in route');
  assert.match(src, /UNAUTHORIZED|401/, 'UNAUTHORIZED/401 auth guard not found in route');
});

// ── Canonical helper: commission calculation with Math.floor ─────────────────
// GH-1284: Math.floor commission logic was moved to computeGuidePayoutEstimate
// in settlement-config.ts (canonical helper). Route delegates to this helper;
// asserting Math.floor in the route would force the logic back out of the helper.
// This test now verifies the contract at the canonical source of truth.

const SETTLEMENT_CONFIG = path.join(ROOT, 'src/lib/settlement-config.ts');

test('canonical helper computeGuidePayoutEstimate uses Math.floor for commission (GH-1284)', () => {
  const helperSrc = readFileSync(SETTLEMENT_CONFIG, 'utf8');
  assert.match(helperSrc, /computeGuidePayoutEstimate/, 'computeGuidePayoutEstimate not found in settlement-config');
  assert.match(helperSrc, /Math\.floor/, 'Math.floor not used in settlement-config canonical helper');
});

test('route delegates commission calculation to canonical helper and returns commissionTwd/netTwd', () => {
  const src = readFileSync(PAYOUT_ROUTE, 'utf8');
  assert.match(src, /computeGuidePayoutEstimate/, 'route must delegate to computeGuidePayoutEstimate helper');
  assert.match(src, /commissionTwd/, 'commissionTwd not in route response');
  assert.match(src, /netTwd/, 'netTwd not in route response');
});

test('route returns totals with gmvTwd, commissionTwd, netTwd', () => {
  const src = readFileSync(PAYOUT_ROUTE, 'utf8');
  assert.match(src, /gmvTwd/, 'gmvTwd missing from route response totals');
  assert.match(src, /commissionTwd/, 'commissionTwd missing from route response totals');
  assert.match(src, /netTwd/, 'netTwd missing from route response totals');
});

// ── Route: guide isolation via activityIds guard ─────────────────────────────

test('route guards orders query by guide activityIds', () => {
  const src = readFileSync(PAYOUT_ROUTE, 'utf8');
  assert.match(src, /activityIds/, 'activityIds guard not found in route');
  assert.match(src, /guide_id/, 'guide_id filter missing from activities query');
});

// ── Route: status filter includes paid/confirmed/completed ───────────────────

test('route filters orders by paid/confirmed/completed statuses', () => {
  const src = readFileSync(PAYOUT_ROUTE, 'utf8');
  assert.match(src, /paid/, "'paid' status missing from route");
  assert.match(src, /confirmed/, "'confirmed' status missing from route");
  assert.match(src, /completed/, "'completed' status missing from route");
});

// ── Route: returns activityTitle per order ───────────────────────────────────

test('route includes activityTitle in each order item', () => {
  const src = readFileSync(PAYOUT_ROUTE, 'utf8');
  assert.match(src, /activityTitle/, 'activityTitle not included in route order response');
});

// ── Page: payout modal state and fetch ──────────────────────────────────────

test('page declares payoutModal state', () => {
  const src = readFileSync(DASHBOARD_PAGE, 'utf8');
  assert.match(src, /payoutModal/, 'payoutModal state not found in dashboard page');
});

test('page fetches /api/guide/payout/monthly', () => {
  const src = readFileSync(DASHBOARD_PAGE, 'utf8');
  assert.match(src, /\/api\/guide\/payout\/monthly/, '/api/guide/payout/monthly fetch not found in page');
});

test('page has openPayoutDetail handler', () => {
  const src = readFileSync(DASHBOARD_PAGE, 'utf8');
  assert.match(src, /openPayoutDetail/, 'openPayoutDetail handler not found in dashboard page');
});

test('page renders payout order table with 行程/訂單金額/平台抽成/預計入帳 columns', () => {
  const src = readFileSync(DASHBOARD_PAGE, 'utf8');
  assert.match(src, /行程/, '行程 column missing from payout modal table');
  assert.match(src, /訂單金額/, '訂單金額 column missing from payout modal table');
  assert.match(src, /平台抽成/, '平台抽成 column missing from payout modal table');
  assert.match(src, /預計入帳/, '預計入帳 column missing from payout modal table');
});

test('page renders 入帳明細 modal title', () => {
  const src = readFileSync(DASHBOARD_PAGE, 'utf8');
  assert.match(src, /入帳明細/, '入帳明細 modal title not found in page');
});

test('page renders 本月預計入帳 card with onClick', () => {
  const src = readFileSync(DASHBOARD_PAGE, 'utf8');
  assert.match(src, /本月預計入帳/, '本月預計入帳 card label not found in page');
  assert.match(src, /openPayoutDetail.*currentMonthStr|currentMonthStr.*openPayoutDetail/, 'openPayoutDetail not wired to currentMonthStr in card onClick');
});
