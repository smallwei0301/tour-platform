// Issue #1221 — enforce payout hold for disputed/refunded/complaint orders
// in the settlement pipeline.
//
// The advisory predicate isPayoutOnHold (post-trip-eligibility.mjs) was
// previously read by admin status/summary endpoints but NOT by the
// settlement sweep. This regression pins the wire-up:
//
//   1. computeSweepPayoutItem must consult isPayoutOnHold.
//   2. Any hold flag (dispute / safety / complaint / oversell) produces
//      null, blocking the order from the payout sweep.
//   3. Partial refund behavior from #847 is preserved — refund alone
//      (without hold flags) still produces a reduced payout item.
//   4. Hold gate fires AFTER full-refund detection so a fully-refunded +
//      disputed order still returns null (no double-counting).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SETTLEMENT_PATH = join(REPO_ROOT, 'src/lib/settlement-config.ts');

const CONFIG = { commission_rate: 0.15, version: 'v1' };

async function loadComputeSweepPayoutItem() {
  const mod = await import(SETTLEMENT_PATH);
  return mod.computeSweepPayoutItem;
}

// ---------- existing #847 behaviour preserved ----------

test('#847 preserved: no refund + no hold flags → full gmv payout item', async () => {
  const computeSweepPayoutItem = await loadComputeSweepPayoutItem();
  const item = computeSweepPayoutItem(
    { id: 'o1', total_twd: 1000, guide_id: 'g1' },
    { refund_amount_twd: 0 },
    CONFIG,
  );
  assert.equal(item?.gmv_twd, 1000);
  assert.equal(item?.commission_twd, 150);
  assert.equal(item?.net_twd, 850);
});

test('#847 preserved: partial refund + no hold flags → reduced payout (not blocked)', async () => {
  const computeSweepPayoutItem = await loadComputeSweepPayoutItem();
  const item = computeSweepPayoutItem(
    { id: 'o2', total_twd: 1000, guide_id: 'g1' },
    { refund_amount_twd: 300 },
    CONFIG,
  );
  assert.equal(item?.gmv_twd, 700, 'partial refund still produces a reduced item');
  assert.equal(item?.commission_twd, 105);
  assert.equal(item?.net_twd, 595);
});

test('#847 preserved: full refund → null (regardless of hold flags)', async () => {
  const computeSweepPayoutItem = await loadComputeSweepPayoutItem();
  const item = computeSweepPayoutItem(
    { id: 'o3', total_twd: 1000, guide_id: 'g1' },
    { refund_amount_twd: 1000, is_disputed: true },
    CONFIG,
  );
  assert.equal(item, null);
});

test('#847 preserved: missing opsTracking → defaults to full gmv (no holds, no refund)', async () => {
  const computeSweepPayoutItem = await loadComputeSweepPayoutItem();
  const item = computeSweepPayoutItem(
    { id: 'o4', total_twd: 2000, guide_id: 'g2' },
    null,
    CONFIG,
  );
  assert.equal(item?.gmv_twd, 2000);
});

// ---------- #1221 new behaviour ----------

test('#1221: is_disputed=true → null (payment dispute hold)', async () => {
  const computeSweepPayoutItem = await loadComputeSweepPayoutItem();
  const item = computeSweepPayoutItem(
    { id: 'o5', total_twd: 1000, guide_id: 'g1' },
    { refund_amount_twd: 0, is_disputed: true },
    CONFIG,
  );
  assert.equal(item, null);
});

test('#1221: is_safety_case=true → null (safety review hold)', async () => {
  const computeSweepPayoutItem = await loadComputeSweepPayoutItem();
  const item = computeSweepPayoutItem(
    { id: 'o6', total_twd: 1000, guide_id: 'g1' },
    { refund_amount_twd: 0, is_safety_case: true },
    CONFIG,
  );
  assert.equal(item, null);
});

test('#1221: has_complaint=true → null (complaint hold)', async () => {
  const computeSweepPayoutItem = await loadComputeSweepPayoutItem();
  const item = computeSweepPayoutItem(
    { id: 'o7', total_twd: 1000, guide_id: 'g1' },
    { refund_amount_twd: 0, has_complaint: true },
    CONFIG,
  );
  assert.equal(item, null);
});

test('#1221: has_oversell_issue=true → null (oversell hold)', async () => {
  const computeSweepPayoutItem = await loadComputeSweepPayoutItem();
  const item = computeSweepPayoutItem(
    { id: 'o8', total_twd: 1000, guide_id: 'g1' },
    { refund_amount_twd: 0, has_oversell_issue: true },
    CONFIG,
  );
  assert.equal(item, null);
});

test('#1221: partial refund + dispute → null (hold outranks reduced payout)', async () => {
  const computeSweepPayoutItem = await loadComputeSweepPayoutItem();
  const item = computeSweepPayoutItem(
    { id: 'o9', total_twd: 1000, guide_id: 'g1' },
    { refund_amount_twd: 300, is_disputed: true },
    CONFIG,
  );
  assert.equal(item, null, 'hold reason must block even when effective gmv > 0');
});

test('#1221: truthy-but-not-=== true flags do NOT trigger hold (defensive)', async () => {
  const computeSweepPayoutItem = await loadComputeSweepPayoutItem();
  const item = computeSweepPayoutItem(
    { id: 'o10', total_twd: 1000, guide_id: 'g1' },
    {
      refund_amount_twd: 0,
      is_disputed: 1,
      is_safety_case: 'yes',
      has_complaint: 'maybe',
      has_oversell_issue: {},
    },
    CONFIG,
  );
  assert.equal(item?.gmv_twd, 1000, 'only boolean === true triggers a hold');
});

// ---------- source contract ----------

test('Source: settlement-config imports isPayoutOnHold from post-trip-eligibility (no reimplementation)', () => {
  const src = readFileSync(SETTLEMENT_PATH, 'utf8');
  assert.match(
    src,
    /import\s*\{\s*isPayoutOnHold\s*\}\s*from\s+['"]\.\/post-trip-eligibility\.mjs['"]/,
    'settlement-config must reuse isPayoutOnHold from post-trip-eligibility',
  );
});

test('Source: computeSweepPayoutItem calls isPayoutOnHold AFTER the effective-gmv calculation', () => {
  const src = readFileSync(SETTLEMENT_PATH, 'utf8');
  const fnStart = src.indexOf('export function computeSweepPayoutItem');
  assert.ok(fnStart > 0, 'computeSweepPayoutItem must be exported');
  const body = src.slice(fnStart, fnStart + 2500);
  const effectiveIdx = body.indexOf('const effective');
  const holdIdx = body.indexOf('isPayoutOnHold(');
  assert.ok(effectiveIdx > 0 && holdIdx > 0, 'both effective-gmv and isPayoutOnHold must appear in the body');
  assert.ok(
    effectiveIdx < holdIdx,
    'effective-gmv guard must run before the hold guard so a fully-refunded + disputed order returns null without spurious work',
  );
});

test('Source: hold call passes refundAmountTwd:0 so partial refund does not double-count as refund_pending hold', () => {
  const src = readFileSync(SETTLEMENT_PATH, 'utf8');
  // Refund is already accounted for by `effective = gross - refunded`. If
  // settlement-config also passed refundAmountTwd to isPayoutOnHold, every
  // partial refund would silently hit refund_pending and produce null —
  // breaking the #847 partial-refund payout path. Lock this against drift.
  assert.match(
    src,
    /isPayoutOnHold\(\{[\s\S]*?refundAmountTwd:\s*0/,
    'computeSweepPayoutItem must pass refundAmountTwd:0 to isPayoutOnHold',
  );
});

test('Source: SweepPayoutItemOpsTracking declares the four hold flags', () => {
  const src = readFileSync(SETTLEMENT_PATH, 'utf8');
  const typeBlock = src.split('export type SweepPayoutItemOpsTracking')[1]?.split('export type SweepPayoutItem ')[0] || '';
  assert.match(typeBlock, /has_complaint\?:\s*boolean/);
  assert.match(typeBlock, /has_oversell_issue\?:\s*boolean/);
  assert.match(typeBlock, /is_disputed\?:\s*boolean/);
  assert.match(typeBlock, /is_safety_case\?:\s*boolean/);
});
