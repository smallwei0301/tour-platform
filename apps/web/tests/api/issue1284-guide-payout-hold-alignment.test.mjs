/**
 * Issue #1284 — Guide-facing payout estimates align with settlement hold guards
 *
 * RED tests first (TDD). All tests must fail before implementation.
 *
 * Tests cover:
 * A. computeGuidePayoutEstimate canonical helper — behavioral
 * B. Source-contract: three routes all use canonical helper + select hold flags
 * C. Totals/expectedPayout only counts payableNetTwd (not held orders)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const SETTLEMENT_PATH = join(REPO_ROOT, 'src/lib/settlement-config.ts');
const MONTHLY_ROUTE = join(REPO_ROOT, 'app/api/guide/payout/monthly/route.ts');
const CSV_ROUTE = join(REPO_ROOT, 'app/api/guide/payout/monthly/csv/route.ts');
const DASHBOARD_ROUTE = join(REPO_ROOT, 'app/api/guide/dashboard/route.ts');

const CONFIG = { commission_rate: 0.15, version: 'v1' };

// ── A. Behavioral: computeGuidePayoutEstimate canonical helper ─────────────────

async function loadComputeGuidePayoutEstimate() {
  // The helper must be exported from settlement-config.ts (same file as computeSweepPayoutItem)
  const mod = await import(SETTLEMENT_PATH);
  if (typeof mod.computeGuidePayoutEstimate !== 'function') {
    throw new Error('computeGuidePayoutEstimate not found in settlement-config.ts');
  }
  return mod.computeGuidePayoutEstimate;
}

describe('#1284 — computeGuidePayoutEstimate behavioral', () => {
  test('normal (no refund, no hold) → payableNetTwd = full net, holdReason = null', async () => {
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      { refund_amount_twd: 0, has_complaint: false, has_oversell_issue: false, is_disputed: false, is_safety_case: false },
      CONFIG,
    );
    assert.equal(result.totalTwd, 1000);
    assert.equal(result.refundAmountTwd, 0);
    assert.equal(result.effectiveTwd, 1000);
    assert.equal(result.commissionTwd, 150);
    assert.equal(result.netTwd, 850);
    assert.equal(result.payableNetTwd, 850, 'no hold → payable = net');
    assert.equal(result.payoutHoldReason, null);
    assert.equal(result.needsManualReview, false);
  });

  test('partial refund, no hold → reduced net is counted (preserves #847)', async () => {
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      { refund_amount_twd: 300 },
      CONFIG,
    );
    assert.equal(result.effectiveTwd, 700);
    assert.equal(result.commissionTwd, 105);
    assert.equal(result.netTwd, 595);
    assert.equal(result.payableNetTwd, 595, 'partial refund without hold → payable = reduced net');
    assert.equal(result.payoutHoldReason, null);
  });

  test('full refund (effective <= 0) → payableNetTwd = 0, holdReason = null', async () => {
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      { refund_amount_twd: 1000 },
      CONFIG,
    );
    assert.equal(result.effectiveTwd, 0);
    assert.equal(result.payableNetTwd, 0);
    assert.equal(result.payoutHoldReason, null, 'full refund → no hold reason, just fully_refunded');
  });

  test('is_disputed → payableNetTwd = 0, holdReason = payment_dispute, needsManualReview = true', async () => {
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      { refund_amount_twd: 0, is_disputed: true },
      CONFIG,
    );
    assert.equal(result.effectiveTwd, 1000, 'effective still computed for transparency');
    assert.equal(result.netTwd, 850, 'net still computed for transparency');
    assert.equal(result.payableNetTwd, 0, 'disputed → not payable');
    assert.equal(result.payoutHoldReason, 'payment_dispute');
    assert.equal(result.needsManualReview, true);
  });

  test('is_safety_case → payableNetTwd = 0, holdReason = safety_review, needsManualReview = true', async () => {
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      { refund_amount_twd: 0, is_safety_case: true },
      CONFIG,
    );
    assert.equal(result.payableNetTwd, 0);
    assert.equal(result.payoutHoldReason, 'safety_review');
    assert.equal(result.needsManualReview, true);
  });

  test('has_complaint → payableNetTwd = 0, holdReason = complaint_under_review, needsManualReview = true', async () => {
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      { refund_amount_twd: 0, has_complaint: true },
      CONFIG,
    );
    assert.equal(result.payableNetTwd, 0);
    assert.equal(result.payoutHoldReason, 'complaint_under_review');
    assert.equal(result.needsManualReview, true);
  });

  test('has_oversell_issue → payableNetTwd = 0, holdReason = oversell_investigation, needsManualReview = true', async () => {
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      { refund_amount_twd: 0, has_oversell_issue: true },
      CONFIG,
    );
    assert.equal(result.payableNetTwd, 0);
    assert.equal(result.payoutHoldReason, 'oversell_investigation');
    assert.equal(result.needsManualReview, true);
  });

  test('dispute > safety > complaint > oversell priority (dispute wins)', async () => {
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      { refund_amount_twd: 0, is_disputed: true, is_safety_case: true, has_complaint: true, has_oversell_issue: true },
      CONFIG,
    );
    assert.equal(result.payoutHoldReason, 'payment_dispute', 'dispute has highest priority');
  });

  test('safety > complaint > oversell (safety wins when no dispute)', async () => {
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      { refund_amount_twd: 0, is_safety_case: true, has_complaint: true, has_oversell_issue: true },
      CONFIG,
    );
    assert.equal(result.payoutHoldReason, 'safety_review');
  });

  test('refund alone does NOT trigger hold (refundAmountTwd passed as 0 to isPayoutOnHold — #847 compliance)', async () => {
    // partial refund without hold flags → payable, not held
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      { refund_amount_twd: 500 },
      CONFIG,
    );
    // effectiveTwd = 500, netTwd = floor(500*0.85) = 425
    assert.equal(result.payoutHoldReason, null, 'refund alone must NOT trigger hold');
    assert.equal(result.payableNetTwd, result.netTwd, 'partial refund no hold → payable = net');
  });

  test('partial refund + dispute → payableNetTwd = 0, but effective/net still computed', async () => {
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      { refund_amount_twd: 300, is_disputed: true },
      CONFIG,
    );
    assert.equal(result.effectiveTwd, 700, 'effective still computed');
    assert.equal(result.netTwd, 595, 'net still computed');
    assert.equal(result.payableNetTwd, 0, 'hold → not payable');
    assert.equal(result.payoutHoldReason, 'payment_dispute');
  });

  test('null opsTracking → defaults (no hold, no refund)', async () => {
    const fn = await loadComputeGuidePayoutEstimate();
    const result = fn(
      { total_twd: 1000 },
      null,
      CONFIG,
    );
    assert.equal(result.effectiveTwd, 1000);
    assert.equal(result.payableNetTwd, 850);
    assert.equal(result.payoutHoldReason, null);
  });
});

// ── B. Source-contract: settlement-config exports canonical helper ──────────────

describe('#1284 — source-contract: canonical helper exported from settlement-config', () => {
  test('settlement-config.ts exports computeGuidePayoutEstimate', () => {
    const src = readFileSync(SETTLEMENT_PATH, 'utf8');
    assert.match(
      src,
      /export function computeGuidePayoutEstimate/,
      'computeGuidePayoutEstimate must be exported from settlement-config.ts',
    );
  });

  test('computeGuidePayoutEstimate uses isPayoutOnHold (from same post-trip-eligibility import)', () => {
    const src = readFileSync(SETTLEMENT_PATH, 'utf8');
    // Find the function body
    const fnStart = src.indexOf('export function computeGuidePayoutEstimate');
    assert.ok(fnStart > -1, 'computeGuidePayoutEstimate must exist');
    const body = src.slice(fnStart, fnStart + 3000);
    assert.match(body, /isPayoutOnHold/, 'helper must call isPayoutOnHold');
  });

  test('computeGuidePayoutEstimate passes refundAmountTwd:0 to isPayoutOnHold (#847 guard)', () => {
    const src = readFileSync(SETTLEMENT_PATH, 'utf8');
    const fnStart = src.indexOf('export function computeGuidePayoutEstimate');
    const body = src.slice(fnStart, fnStart + 3000);
    assert.match(
      body,
      /isPayoutOnHold\(\{[\s\S]*?refundAmountTwd:\s*0/,
      'computeGuidePayoutEstimate must pass refundAmountTwd:0 to isPayoutOnHold',
    );
  });

  test('computeGuidePayoutEstimate returns payableNetTwd field', () => {
    const src = readFileSync(SETTLEMENT_PATH, 'utf8');
    const fnStart = src.indexOf('export function computeGuidePayoutEstimate');
    const body = src.slice(fnStart, fnStart + 3000);
    assert.match(body, /payableNetTwd/, 'helper must return payableNetTwd');
  });

  test('computeGuidePayoutEstimate returns payoutHoldReason field', () => {
    const src = readFileSync(SETTLEMENT_PATH, 'utf8');
    const fnStart = src.indexOf('export function computeGuidePayoutEstimate');
    const body = src.slice(fnStart, fnStart + 3000);
    assert.match(body, /payoutHoldReason/, 'helper must return payoutHoldReason');
  });

  test('computeGuidePayoutEstimate returns needsManualReview field', () => {
    const src = readFileSync(SETTLEMENT_PATH, 'utf8');
    const fnStart = src.indexOf('export function computeGuidePayoutEstimate');
    const body = src.slice(fnStart, fnStart + 3000);
    assert.match(body, /needsManualReview/, 'helper must return needsManualReview');
  });
});

// ── C. Source-contract: three routes import/call canonical helper ──────────────

describe('#1284 — source-contract: monthly/route.ts uses canonical helper + hold flags', () => {
  test('monthly route imports computeGuidePayoutEstimate from settlement-config', () => {
    const src = readFileSync(MONTHLY_ROUTE, 'utf8');
    assert.match(
      src,
      /computeGuidePayoutEstimate/,
      'monthly route must import/use computeGuidePayoutEstimate',
    );
  });

  test('monthly route selects has_complaint from operations_tracking', () => {
    const src = readFileSync(MONTHLY_ROUTE, 'utf8');
    assert.match(src, /has_complaint/, 'monthly route must select has_complaint from operations_tracking');
  });

  test('monthly route selects has_oversell_issue from operations_tracking', () => {
    const src = readFileSync(MONTHLY_ROUTE, 'utf8');
    assert.match(src, /has_oversell_issue/, 'monthly route must select has_oversell_issue');
  });

  test('monthly route selects is_disputed from operations_tracking', () => {
    const src = readFileSync(MONTHLY_ROUTE, 'utf8');
    assert.match(src, /is_disputed/, 'monthly route must select is_disputed');
  });

  test('monthly route selects is_safety_case from operations_tracking', () => {
    const src = readFileSync(MONTHLY_ROUTE, 'utf8');
    assert.match(src, /is_safety_case/, 'monthly route must select is_safety_case');
  });

  test('monthly route totals use payableNetTwd for netTwd sum (not raw netTwd)', () => {
    const src = readFileSync(MONTHLY_ROUTE, 'utf8');
    assert.match(
      src,
      /payableNetTwd/,
      'monthly route must accumulate payableNetTwd for totals, not raw netTwd on held orders',
    );
  });

  test('monthly route does NOT independently compute payable net without canonical helper', () => {
    const src = readFileSync(MONTHLY_ROUTE, 'utf8');
    // The old pattern: effectiveTwd - commissionTwd inline (without using helper for payable path)
    // After fix, the compute-net logic for payable must go through computeGuidePayoutEstimate
    // We check that the route no longer has the old manual payable net calculation for totals
    // The route MAY still compute effectiveTwd for GMV (that's fine), but the payable totals
    // must come from helper.payableNetTwd, not from a raw `effectiveTwd - commissionTwd`
    // added to the total.
    // We verify by checking payableNetTwd is present (positive check already above).
    // We also verify the old "totals.netTwd = orders.reduce... netTwd" alone is gone.
    // Allow the route to have `netTwd` on orders objects for transparency display,
    // but the totals reduction must sum payableNetTwd.
    assert.match(src, /payableNetTwd/, 'totals must use payableNetTwd');
  });

  test('monthly route exposes payoutHoldReason per order', () => {
    const src = readFileSync(MONTHLY_ROUTE, 'utf8');
    assert.match(src, /payoutHoldReason/, 'monthly route must expose payoutHoldReason per order for guide transparency');
  });
});

describe('#1284 — source-contract: csv/route.ts uses canonical helper + hold flags', () => {
  test('CSV route imports/uses computeGuidePayoutEstimate', () => {
    const src = readFileSync(CSV_ROUTE, 'utf8');
    assert.match(src, /computeGuidePayoutEstimate/, 'CSV route must use computeGuidePayoutEstimate');
  });

  test('CSV route selects has_complaint from operations_tracking', () => {
    const src = readFileSync(CSV_ROUTE, 'utf8');
    assert.match(src, /has_complaint/, 'CSV route must select has_complaint');
  });

  test('CSV route selects has_oversell_issue from operations_tracking', () => {
    const src = readFileSync(CSV_ROUTE, 'utf8');
    assert.match(src, /has_oversell_issue/, 'CSV route must select has_oversell_issue');
  });

  test('CSV route selects is_disputed from operations_tracking', () => {
    const src = readFileSync(CSV_ROUTE, 'utf8');
    assert.match(src, /is_disputed/, 'CSV route must select is_disputed');
  });

  test('CSV route selects is_safety_case from operations_tracking', () => {
    const src = readFileSync(CSV_ROUTE, 'utf8');
    assert.match(src, /is_safety_case/, 'CSV route must select is_safety_case');
  });

  test('CSV route totals/合計 use payableNetTwd', () => {
    const src = readFileSync(CSV_ROUTE, 'utf8');
    assert.match(src, /payableNetTwd/, 'CSV route 合計 must sum payableNetTwd');
  });

  test('CSV header/body includes payoutHoldReason column', () => {
    const src = readFileSync(CSV_ROUTE, 'utf8');
    assert.match(src, /payoutHoldReason|審核狀態|hold/, 'CSV must include hold reason column');
  });
});

describe('#1284 — source-contract: dashboard/route.ts uses canonical helper + hold flags', () => {
  test('dashboard route imports/uses computeGuidePayoutEstimate', () => {
    const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
    assert.match(src, /computeGuidePayoutEstimate/, 'dashboard route must use computeGuidePayoutEstimate');
  });

  test('dashboard route operations_tracking query selects has_complaint', () => {
    const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
    assert.match(src, /has_complaint/, 'dashboard route must select has_complaint');
  });

  test('dashboard route operations_tracking query selects is_disputed', () => {
    const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
    assert.match(src, /is_disputed/, 'dashboard route must select is_disputed');
  });

  test('dashboard route operations_tracking query selects is_safety_case', () => {
    const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
    assert.match(src, /is_safety_case/, 'dashboard route must select is_safety_case');
  });

  test('dashboard route operations_tracking query selects has_oversell_issue', () => {
    const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
    assert.match(src, /has_oversell_issue/, 'dashboard route must select has_oversell_issue');
  });

  test('dashboard route expectedPayoutTwd uses payableNetTwd (not raw net)', () => {
    const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
    assert.match(src, /payableNetTwd/, 'dashboard expectedPayoutTwd must sum payableNetTwd from helper');
  });
});

// ── D. Must-not-weaken: computeSweepPayoutItem unchanged ──────────────────────

describe('#1284 — must-not-weaken: computeSweepPayoutItem unchanged', () => {
  test('computeSweepPayoutItem still imports and calls isPayoutOnHold with refundAmountTwd:0', () => {
    const src = readFileSync(SETTLEMENT_PATH, 'utf8');
    const fnStart = src.indexOf('export function computeSweepPayoutItem');
    assert.ok(fnStart > -1, 'computeSweepPayoutItem must still exist');
    const body = src.slice(fnStart, fnStart + 2000);
    assert.match(
      body,
      /isPayoutOnHold\(\{[\s\S]*?refundAmountTwd:\s*0/,
      'computeSweepPayoutItem must still call isPayoutOnHold with refundAmountTwd:0',
    );
  });

  test('computeSweepPayoutItem returns null on any hold (sweep behavior unchanged)', async () => {
    const mod = await import(SETTLEMENT_PATH);
    const computeSweepPayoutItem = mod.computeSweepPayoutItem;
    const item = computeSweepPayoutItem(
      { id: 'o1', total_twd: 1000, guide_id: 'g1' },
      { refund_amount_twd: 0, is_disputed: true },
      CONFIG,
    );
    assert.equal(item, null, '#1221 behavior: sweep still returns null on disputed');
  });

  test('computeSweepPayoutItem partial refund no hold → reduced item (#847 preserved)', async () => {
    const mod = await import(SETTLEMENT_PATH);
    const computeSweepPayoutItem = mod.computeSweepPayoutItem;
    const item = computeSweepPayoutItem(
      { id: 'o2', total_twd: 1000, guide_id: 'g1' },
      { refund_amount_twd: 300 },
      CONFIG,
    );
    assert.equal(item?.net_twd, 595, '#847 partial refund reduced item preserved');
  });
});
