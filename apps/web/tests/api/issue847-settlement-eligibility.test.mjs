/**
 * Contract + behavioural tests for Issue #847 — Align settlement sweep
 * eligibility with payout policy.
 *
 * Source of truth (拍板 by Wei, 2026-05):
 * - docs/05-business/06-payment-plan/03-settlement-rules.md §5 「不結算情境」
 *   - 訂單尚未完成 → status MUST be 'completed'
 *   - 訂單已申請退款且未結案 → exclude refund_pending
 *   - 訂單有爭議 / 客訴升級中 → exclude (modelled as refund_pending in current schema)
 *   - 金流狀態與平台訂單狀態不一致 → already implicitly excluded
 * - docs/05-business/06-payment-plan/05-settlement-payout-ops-runbook.md §2
 *   - 對應活動狀態為 'completed'
 *   - 活動完成日 + 7 天(T+7)已過 (existing isOrderEligibleForSettlement)
 *   - 無 refund_pending 或 dispute 訂單
 * - §4 抽成計算基礎:旅客實付金額(扣除已退款部分後)
 *   → effective_gmv = total_twd - operations_tracking.refund_amount_twd
 *
 * This file supersedes the obsolete paid/confirmed/completed contract in
 * issue447-settlement-sweep.test.mjs (per #847 AC #4).
 */
import { readFileSync } from 'fs';
import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const routePath = join(__dirname, '../../app/api/internal/settlement/sweep/route.ts');
const dbPath = join(__dirname, '../../src/lib/db-settlement-ops.mjs'); // #1613 strangler 後實作所在

// ── AC #1: eligibility predicate = completed + T+7 + no refund_pending ────────

describe('Issue 847 — sweep route eligibility predicate', () => {
  it('filters orders to status = "completed" only (not paid/confirmed)', () => {
    const src = readFileSync(routePath, 'utf8');
    // The new policy: only completed orders enter payout.
    // We accept either .eq('status', 'completed') or .in('status', ['completed']).
    const usesCompletedOnly =
      /\.eq\(\s*['"]status['"]\s*,\s*['"]completed['"]\s*\)/.test(src) ||
      /\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]completed['"]\s*\]\s*\)/.test(src);
    assert.ok(
      usesCompletedOnly,
      'sweep route must narrow status filter to completed only (per docs §5)',
    );
    // And it MUST NOT also list paid or confirmed in any settlement-include filter.
    assert.doesNotMatch(
      src,
      /\.in\(\s*['"]status['"]\s*,\s*\[[^\]]*['"]paid['"][^\]]*['"]confirmed['"][^\]]*\]/,
      'sweep route must not include paid/confirmed in eligibility filter',
    );
  });

  it('still uses isOrderEligibleForSettlement for T+7 cutoff (existing behaviour preserved)', () => {
    const src = readFileSync(routePath, 'utf8');
    assert.match(src, /isOrderEligibleForSettlement/, 'must keep T+7 cutoff helper');
    assert.match(src, /pickEffectiveStartAt/, 'must keep V2/legacy start_at picker');
  });

  it('joins or fetches operations_tracking.refund_amount_twd for effective-amount math (AC #3)', () => {
    const src = readFileSync(routePath, 'utf8');
    assert.match(
      src,
      /operations_tracking/,
      'sweep route must read operations_tracking to compute effective amount',
    );
    assert.match(
      src,
      /refund_amount_twd/,
      'sweep route must use refund_amount_twd to derive effective gmv',
    );
  });

  it('documents the policy source in route header comment', () => {
    const src = readFileSync(routePath, 'utf8');
    // The route's top-of-file comment must point at the canonical policy doc
    // so future readers know why paid/confirmed were dropped.
    assert.match(
      src,
      /03-settlement-rules\.md|#847/,
      'route header comment must reference settlement-rules.md or issue #847',
    );
  });
});

// ── AC #2: payout_items / guide_balances exclude refund/dispute orders ───────

describe('Issue 847 — db.mjs getUnsettledOrdersDb narrowed to completed', () => {
  it('getUnsettledOrdersDb filters status to "completed" only', () => {
    const src = readFileSync(dbPath, 'utf8');
    const fnStart = src.indexOf('export async function getUnsettledOrdersDb');
    assert.ok(fnStart >= 0, 'getUnsettledOrdersDb must be exported');
    const fnEnd = src.indexOf('\nexport ', fnStart + 1);
    const fnBody = src.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
    const usesCompletedOnly =
      /\.eq\(\s*['"]status['"]\s*,\s*['"]completed['"]\s*\)/.test(fnBody) ||
      /\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]completed['"]\s*\]\s*\)/.test(fnBody);
    assert.ok(
      usesCompletedOnly,
      'getUnsettledOrdersDb must filter only completed orders (per #847)',
    );
    assert.doesNotMatch(
      fnBody,
      /\.in\(\s*['"]status['"]\s*,\s*\[[^\]]*['"]paid['"][^\]]*\]/,
      'getUnsettledOrdersDb must not include paid in eligibility filter',
    );
  });
});

// ── AC #3 + #5: effective-amount math + regression fixtures ───────────────────

describe('Issue 847 — effective amount math and regression cases', () => {
  it('exports computeSweepPayoutItem from settlement-config helper for unit testing', async () => {
    // The math should be extracted to a pure helper so tests can exercise it
    // without spinning a fake Supabase. If implementer chooses inline math,
    // they must still expose the helper as documented under settlement-config.
    const cfgPath = join(__dirname, '../../src/lib/settlement-config.ts');
    const src = readFileSync(cfgPath, 'utf8');
    assert.match(
      src,
      /export\s+function\s+computeSweepPayoutItem/,
      'settlement-config must export computeSweepPayoutItem(order, opsTracking, config)',
    );
  });

  it('eligible completed order with no refund → full gmv into payout', async () => {
    const { computeSweepPayoutItem } = await import(
      join(__dirname, '../../src/lib/settlement-config.ts')
    );
    const item = computeSweepPayoutItem(
      { id: 'o1', total_twd: 1000, guide_id: 'g1' },
      { refund_amount_twd: 0 },
      { commission_rate: 0.15, version: 'v1' },
    );
    assert.equal(item.gmv_twd, 1000, 'full gmv when no refund');
    assert.equal(item.commission_twd, 150, 'commission = floor(1000 * 0.15)');
    assert.equal(item.net_twd, 850, 'net = floor(1000 * 0.85)');
  });

  it('completed order with partial refund → effective gmv (post-refund) in payout', async () => {
    const { computeSweepPayoutItem } = await import(
      join(__dirname, '../../src/lib/settlement-config.ts')
    );
    const item = computeSweepPayoutItem(
      { id: 'o2', total_twd: 1000, guide_id: 'g1' },
      { refund_amount_twd: 300 },
      { commission_rate: 0.15, version: 'v1' },
    );
    assert.equal(item.gmv_twd, 700, 'effective gmv = 1000 - 300');
    assert.equal(item.commission_twd, 105, 'commission = floor(700 * 0.15)');
    assert.equal(item.net_twd, 595, 'net = floor(700 * 0.85)');
  });

  it('completed order with full refund (refund == total) → returns null (skip payout)', async () => {
    const { computeSweepPayoutItem } = await import(
      join(__dirname, '../../src/lib/settlement-config.ts')
    );
    const item = computeSweepPayoutItem(
      { id: 'o3', total_twd: 1000, guide_id: 'g1' },
      { refund_amount_twd: 1000 },
      { commission_rate: 0.15, version: 'v1' },
    );
    assert.equal(item, null, 'fully refunded orders must skip payout creation');
  });

  it('completed order with refund > total (over-refund accounting edge) → null', async () => {
    const { computeSweepPayoutItem } = await import(
      join(__dirname, '../../src/lib/settlement-config.ts')
    );
    const item = computeSweepPayoutItem(
      { id: 'o4', total_twd: 1000, guide_id: 'g1' },
      { refund_amount_twd: 1200 },
      { commission_rate: 0.15, version: 'v1' },
    );
    assert.equal(item, null, 'over-refund (defensive) must also skip payout');
  });

  it('missing operations_tracking row defaults refund_amount_twd to 0 (full gmv)', async () => {
    const { computeSweepPayoutItem } = await import(
      join(__dirname, '../../src/lib/settlement-config.ts')
    );
    const item = computeSweepPayoutItem(
      { id: 'o5', total_twd: 2000, guide_id: 'g2' },
      null,
      { commission_rate: 0.15, version: 'v1' },
    );
    assert.equal(item.gmv_twd, 2000, 'no ops tracking → treat as no refund');
    assert.equal(item.commission_twd, 300);
    assert.equal(item.net_twd, 1700);
  });

  it('snapshots rules_version from config onto the payout item', async () => {
    const { computeSweepPayoutItem } = await import(
      join(__dirname, '../../src/lib/settlement-config.ts')
    );
    const item = computeSweepPayoutItem(
      { id: 'o6', total_twd: 500, guide_id: 'g3' },
      { refund_amount_twd: 0 },
      { commission_rate: 0.15, version: 'v2-staging' },
    );
    assert.equal(item.rules_version, 'v2-staging');
  });
});

// ── AC #6: payout copy reflects the new eligibility policy ───────────────────

describe('Issue 847 — payout policy copy aligned with implementation', () => {
  it('settlement-rules doc still pins the v1 policy strings', () => {
    const docPath = join(
      __dirname,
      '../../../../docs/05-business/06-payment-plan/03-settlement-rules.md',
    );
    const src = readFileSync(docPath, 'utf8');
    // Sanity: doc is the source the code aligns to. If the doc loses these
    // sentences, the implementation contract for #847 has moved underneath us.
    assert.match(src, /訂單尚未完成/, 'doc §5 must list 訂單尚未完成');
    assert.match(src, /訂單已申請退款且未結案/, 'doc §5 must list refund_pending exclusion');
    assert.match(src, /T\+7/, 'doc §3 must pin T+7');
  });
});
