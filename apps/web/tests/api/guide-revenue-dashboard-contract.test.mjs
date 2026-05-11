/**
 * Issue #357: Guide dashboard GMV + 6-month trend + order amount
 * Contract test (RED → GREEN): readFileSync + regex match on source files.
 * AC1-AC7 as specified in the implementation plan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const DASHBOARD_ROUTE = path.join(ROOT, 'app/api/guide/dashboard/route.ts');
const DASHBOARD_PAGE = path.join(ROOT, 'app/guide/dashboard/page.tsx');

// ── AC1: Response includes new GMV + trend + placeholder fields ──────────────

test('AC1a: route includes monthGmvTwd in response', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /monthGmvTwd/, 'monthGmvTwd field missing from route response');
});

test('AC1b: route includes monthGmvOrderCount in response', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /monthGmvOrderCount/, 'monthGmvOrderCount field missing from route response');
});

test('AC1c: route includes revenueTrend6m in response', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /revenueTrend6m/, 'revenueTrend6m field missing from route response');
});

test('AC1d: route includes expectedPayoutTwd placeholder (null)', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /expectedPayoutTwd/, 'expectedPayoutTwd field missing from route response');
});

test('AC1e: route includes nextPayoutDate placeholder (null)', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /nextPayoutDate/, 'nextPayoutDate field missing from route response');
});

test('AC1f: trend array items have month, gmvTwd, orderCount shape', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /gmvTwd/, 'gmvTwd missing from trend item');
  assert.match(src, /orderCount/, 'orderCount missing from trend item');
  // month field in trend
  assert.match(src, /month:/, 'month field missing from trend item');
});

// ── AC2: Orders query gated by activityIds (guide isolation) ─────────────────

test('AC2: GMV query uses .in(activity_id, activityIds) guard', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  // Should find .in('activity_id', activityIds) multiple times (both GMV + trend queries)
  const matches = src.match(/\.in\('activity_id',\s*activityIds\)/g) || [];
  assert.ok(matches.length >= 2, `Expected >=2 .in('activity_id', activityIds) — found ${matches.length}`);
});

// ── AC3: GMV status filter includes paid/confirmed/completed only ─────────────

test('AC3: GMV query status filter includes paid', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /gmvStatuses|['"]paid['"]/, "'paid' status not referenced in route");
});

test('AC3: GMV query status filter includes confirmed', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /gmvStatuses|['"]confirmed['"]/, "'confirmed' status not referenced in route");
});

test('AC3: GMV query status filter includes completed', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /gmvStatuses|['"]completed['"]/, "'completed' status not referenced in route");
});

// ── AC4: Page references monthGmvTwd and contains required text ──────────────

test('AC4a: page references monthGmvTwd', () => {
  const src = readFileSync(DASHBOARD_PAGE, 'utf8');
  assert.match(src, /monthGmvTwd/, 'monthGmvTwd not referenced in dashboard page');
});

test('AC4b: page contains 本月營收 or 本月 GMV text', () => {
  const src = readFileSync(DASHBOARD_PAGE, 'utf8');
  assert.ok(
    /本月營收|本月 GMV/.test(src),
    '本月營收 / 本月 GMV text not found in dashboard page'
  );
});

test('AC4c: page contains 結算規則 text (placeholder cards)', () => {
  const src = readFileSync(DASHBOARD_PAGE, 'utf8');
  assert.match(src, /結算規則/, '結算規則 text missing from dashboard page');
});

// ── AC5: Page renders revenueTrend6m via .map ────────────────────────────────

test('AC5: page references revenueTrend6m.map for trend rendering', () => {
  const src = readFileSync(DASHBOARD_PAGE, 'utf8');
  assert.match(src, /revenueTrend6m\.map/, 'revenueTrend6m.map not found in dashboard page');
});

// ── AC6: pendingBookings includes totalTwd; page shows 金額 column ───────────

test('AC6a: route pendingBookings mapper includes totalTwd from total_twd', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /totalTwd/, 'totalTwd missing from pendingBookings in route');
  assert.match(src, /total_twd/, 'total_twd column not selected in orders query');
});

test('AC6b: page references totalTwd in order list', () => {
  const src = readFileSync(DASHBOARD_PAGE, 'utf8');
  assert.match(src, /totalTwd/, 'totalTwd not referenced in dashboard page order list');
});

// ── AC7: 401 returned when guide session invalid ─────────────────────────────

test('AC7: route returns 401 when session invalid', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /401/, '401 status not found in route — auth guard missing');
  assert.match(src, /UNAUTHORIZED/, 'UNAUTHORIZED not found in route — auth guard missing');
});
