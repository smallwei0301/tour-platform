/**
 * Static contract test for issue #475: 待對帳 block for refund_pending orders.
 * Reads the route.ts source and asserts the contract without network calls.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { test } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routePath = join(__dirname, '../../app/api/guide/dashboard/route.ts');
const pageSource = readFileSync(join(__dirname, '../../app/(non-locale)/guide/dashboard/page.tsx'), 'utf8');
const routeSource = readFileSync(routePath, 'utf8');

test('route.ts: includes pendingSettlementOrders in final response', () => {
  assert.ok(
    routeSource.includes('pendingSettlementOrders'),
    'route.ts must include pendingSettlementOrders in response'
  );
});

test('route.ts: filters by status refund_pending', () => {
  assert.ok(
    routeSource.includes("eq('status', 'refund_pending')"),
    "route.ts must filter orders by status = 'refund_pending'"
  );
});

test('route.ts: does NOT filter by status refunded', () => {
  // 'refunded' as a standalone status filter must not appear in pendingSettlement context
  // The gmvStatuses array may include other statuses but refunded should not be the eq filter
  const refundedEqMatch = routeSource.match(/eq\('status',\s*'refunded'\)/g);
  assert.ok(
    !refundedEqMatch || refundedEqMatch.length === 0,
    "route.ts must NOT filter pendingSettlementOrders by status = 'refunded'"
  );
});

test('route.ts: pendingSettlementOrders array items include required fields', () => {
  assert.ok(routeSource.includes('orderId: o.id'), 'must map orderId');
  assert.ok(routeSource.includes('tourTitle:'), 'must map tourTitle');
  assert.ok(routeSource.includes('scheduleDate:'), 'must map scheduleDate');
  assert.ok(routeSource.includes('totalTwd: o.total_twd'), 'must map totalTwd');
  assert.ok(routeSource.includes('status: o.status'), 'must map status');
});

test('route.ts: returns pendingSettlementOrders: [] in no-activities early return', () => {
  // Both early return branches should include pendingSettlementOrders: []
  const earlyReturnMatches = routeSource.match(/pendingSettlementOrders:\s*\[\]/g);
  assert.ok(
    earlyReturnMatches && earlyReturnMatches.length >= 2,
    'both early-return branches must include pendingSettlementOrders: []'
  );
});

test('route.ts: joins activity_schedules for schedule date', () => {
  assert.ok(
    routeSource.includes("from('activity_schedules')") &&
    routeSource.includes('refundScheduleMap'),
    'route.ts must join activity_schedules for refund_pending schedule dates'
  );
});

test('page.tsx: DashboardData type includes pendingSettlementOrders', () => {
  assert.ok(
    pageSource.includes('pendingSettlementOrders:'),
    'DashboardData type must include pendingSettlementOrders'
  );
});

test('page.tsx: STATUS_LABELS includes refund_pending → 待對帳', () => {
  assert.ok(
    pageSource.includes("refund_pending: '待對帳'"),
    'STATUS_LABELS must map refund_pending to 待對帳'
  );
});

test('page.tsx: StatusPill color map includes refund_pending', () => {
  assert.ok(
    pageSource.includes("refund_pending: {"),
    'StatusPill color map must include refund_pending entry'
  );
});

test('page.tsx: 待對帳 section is rendered', () => {
  assert.ok(
    pageSource.includes('待對帳'),
    'page.tsx must include 待對帳 section'
  );
  assert.ok(
    pageSource.includes('退款處理中，金額可能變動'),
    'page.tsx must include subtitle text'
  );
});

test('page.tsx: 待對帳 section hidden when no pending settlement orders', () => {
  assert.ok(
    pageSource.includes('pendingSettlementOrders?.length ?? 0) > 0'),
    'section must be conditionally rendered only when there are pendingSettlementOrders'
  );
});
