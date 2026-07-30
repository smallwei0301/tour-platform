/**
 * Issue #1106 (Post-Trip Ops, payout-eligibility enforcement leaf) —
 * settlement sweep must FETCH the operations_tracking hold flags so the
 * #1221 payout-hold gate in computeSweepPayoutItem can actually fire.
 *
 * Bug being locked down:
 *   computeSweepPayoutItem() (settlement-config.ts, #1221) already returns
 *   null when has_complaint / has_oversell_issue is true. But the settlement
 *   sweep route only SELECTed `operations_tracking(refund_amount_twd)`, so
 *   has_complaint / has_oversell_issue arrived as `undefined`, the `=== true`
 *   checks evaluated to false, and a 'completed' order with an open complaint
 *   or oversell investigation was still settled into payout_items.
 *
 *   This is exactly the #1106 acceptance gap: "Payout eligibility 明確排除
 *   refund/complaint/safety/payment dispute；不得因 order completed 就自動
 *   payable." The helper enforced it; the route starved it of data.
 *
 * Scope note（2026-07-29 更新，#1777 缺口 1）——本檔原本斷言 sweep「不得」
 * select is_disputed / is_safety_case，理由是那兩欄不是 schema 欄位。**該假設
 * 已過期**：migration 20260618_operations_tracking_dispute_safety_flags.sql 已
 * 把兩欄建為實體欄位，導遊端 computeGuidePayoutEstimate 也早已讀取它們。過期
 * 的反向斷言使「dispute／safety 訂單被錯誤結算」這個錯誤行為得以測試全綠。
 * 現已反轉為「必須投影四個 hold 旗標」，行為層契約見
 * tests/api/issue1777-dispute-safety-hold-projection.test.mjs。
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SWEEP_ROUTE_PATH = join(__dirname, '../../app/api/internal/settlement/sweep/route.ts');
const SETTLEMENT_CONFIG_PATH = join(__dirname, '../../src/lib/settlement-config.ts');

/** Extract the operations_tracking(...) projection from the sweep route's select(). */
function sweepOpsTrackingProjection() {
  const src = readFileSync(SWEEP_ROUTE_PATH, 'utf8');
  // Match the query projection `operations_tracking(...)`, NOT the TS type
  // annotation `operations_tracking?: { ... }`.
  const match = src.match(/operations_tracking\(([^)]*)\)/);
  return match ? match[1] : null;
}

describe('GH-1106 — settlement sweep projects the operations_tracking hold flags', () => {
  it('sweep route selects refund_amount_twd (effective-gmv / partial refund, #847)', () => {
    const projection = sweepOpsTrackingProjection();
    assert.ok(projection, 'sweep route must select an operations_tracking(...) projection');
    assert.match(projection, /refund_amount_twd/, 'must keep refund_amount_twd for #847 effective-gmv math');
  });

  it('sweep route selects has_complaint so the #1221 complaint hold can fire', () => {
    const projection = sweepOpsTrackingProjection();
    assert.match(
      projection,
      /has_complaint/,
      'sweep must fetch has_complaint; otherwise computeSweepPayoutItem sees undefined and never holds a complained order'
    );
  });

  it('sweep route selects has_oversell_issue so the #1221 oversell hold can fire', () => {
    const projection = sweepOpsTrackingProjection();
    assert.match(
      projection,
      /has_oversell_issue/,
      'sweep must fetch has_oversell_issue; otherwise an oversell-investigation order is wrongly settled'
    );
  });

  it('sweep route selects is_disputed so the payment_dispute hold can fire (#1777)', () => {
    const projection = sweepOpsTrackingProjection();
    assert.match(
      projection,
      /is_disputed/,
      'is_disputed 自 migration 20260618 起是實體欄位；未投影會讓付款爭議訂單被錯誤結算'
    );
  });

  it('sweep route selects is_safety_case so the safety_review hold can fire (#1777)', () => {
    const projection = sweepOpsTrackingProjection();
    assert.match(
      projection,
      /is_safety_case/,
      'is_safety_case 自 migration 20260618 起是實體欄位；未投影會讓安全案件訂單被錯誤結算'
    );
  });

  it('sweep route still passes the ops-tracking row into computeSweepPayoutItem', () => {
    const src = readFileSync(SWEEP_ROUTE_PATH, 'utf8');
    assert.match(src, /computeSweepPayoutItem\(/, 'sweep must delegate payout math + hold gate to the shared helper');
    // The helper is invoked with the per-order opsTracking object, so the
    // freshly-projected hold flags reach the #1221 gate.
    assert.match(src, /opsTracking\s*\?\?\s*null/, 'sweep must forward the resolved opsTracking row (or null) to the helper');
  });
});

// ── Behavioral guard: the gate the projection feeds actually holds ──────────────
// Locks the end-to-end intent: with the columns now fetched, a complaint /
// oversell order yields no payout item. (computeSweepPayoutItem is also unit-
// tested in issue1221; here we assert it against the exact opsTracking shape
// the sweep projection produces.)

async function loadComputeSweepPayoutItem() {
  const mod = await import(`../../src/lib/settlement-config.ts`);
  return mod.computeSweepPayoutItem;
}

describe('GH-1106 — projected hold flags block payout end-to-end', () => {
  const config = { commission_rate: 0.2, version: 'v1' };
  const order = { id: 'o1', total_twd: 1000, guide_id: 'g1' };

  it('has_complaint=true → no payout item (complaint_under_review hold)', async () => {
    const compute = await loadComputeSweepPayoutItem();
    const item = compute(order, { refund_amount_twd: 0, has_complaint: true, has_oversell_issue: false }, config);
    assert.equal(item, null, 'complained order must not be settled into payout_items');
  });

  it('has_oversell_issue=true → no payout item (oversell_investigation hold)', async () => {
    const compute = await loadComputeSweepPayoutItem();
    const item = compute(order, { refund_amount_twd: 0, has_complaint: false, has_oversell_issue: true }, config);
    assert.equal(item, null, 'oversell-investigation order must not be settled into payout_items');
  });

  it('no hold flags → payout item is produced (regression: clean order still pays)', async () => {
    const compute = await loadComputeSweepPayoutItem();
    const item = compute(order, { refund_amount_twd: 0, has_complaint: false, has_oversell_issue: false }, config);
    assert.ok(item, 'clean completed order must still settle');
    assert.equal(item.net_twd, 800, 'net = floor(1000 * (1 - 0.2))');
  });
});
