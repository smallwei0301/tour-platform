/**
 * Issue #1591 加購計價 ＋ #1594 點數計算 純函式測試。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addonLineSubtotal, recomputeOrderAddons } from '../../src/lib/addon-pricing.mjs';
import { calcEarnedPoints, availableBalance, maxRedeemable, POINTS_CONFIG } from '../../src/lib/points-calc.mjs';

// ── #1591 加購 ──────────────────────────────────────────────
test('T1591.1 — per_person 乘人數、per_group 不乘', () => {
  assert.equal(addonLineSubtotal({ id: 'a', priceTwd: 100, unit: 'per_person' }, 2, 3), 600); // 100*2*3
  assert.equal(addonLineSubtotal({ id: 'b', priceTwd: 500, unit: 'per_group' }, 2, 3), 1000); // 500*2
});

test('T1591.2 — recompute：以 DB 快照重算，未知/下架/庫存不足/數量非法標 error', () => {
  const defs = [
    { id: 'meal', priceTwd: 200, unit: 'per_person', isActive: true, stock: null },
    { id: 'gear', priceTwd: 300, unit: 'per_group', isActive: true, stock: 1 },
    { id: 'old', priceTwd: 100, unit: 'per_person', isActive: false },
  ];
  const r = recomputeOrderAddons(defs, [
    { addonId: 'meal', quantity: 2 },   // 200*2*2(people) = 800
    { addonId: 'gear', quantity: 2 },   // stock 1 < 2 → error
    { addonId: 'old', quantity: 1 },    // inactive
    { addonId: 'ghost', quantity: 1 },  // unknown
    { addonId: 'meal', quantity: 0 },   // invalid qty
  ], 2);
  assert.equal(r.total, 800);
  const byErr = Object.fromEntries(r.lines.filter((l) => l.error).map((l) => [l.addonId, l.error]));
  assert.equal(byErr.gear, 'insufficient_stock');
  assert.equal(byErr.old, 'addon_inactive');
  assert.equal(byErr.ghost, 'unknown_addon');
});

// ── #1594 點數 ──────────────────────────────────────────────
test('T1594.1 — 回饋 1% 無條件捨去', () => {
  assert.equal(POINTS_CONFIG.earnRate, 0.01);
  assert.equal(calcEarnedPoints(4380), 43); // 43.8 → 43
  assert.equal(calcEarnedPoints(99), 0);
});

test('T1594.2 — 可用餘額排除已過期回饋', () => {
  const entries = [
    { delta: 100, expiresAt: '2027-01-01T00:00:00Z' }, // 未過期
    { delta: 50, expiresAt: '2026-01-01T00:00:00Z' },  // 已過期（now 後）
    { delta: -30 },                                     // 折抵（負）
  ];
  assert.equal(availableBalance(entries, '2026-07-01T00:00:00Z'), 70); // 100 - 30（過期的 50 不計）
});

test('T1594.3 — 折抵上限＝min(餘額, 訂單×30%)', () => {
  assert.equal(maxRedeemable(1000, 2000), 600);  // 2000*0.3=600 < 1000
  assert.equal(maxRedeemable(200, 2000), 200);   // 餘額 200 < 600
  assert.equal(maxRedeemable(0, 2000), 0);
});

test('T1594.4 — 餘額下限 0（負 ledger 不會變負餘額）', () => {
  assert.equal(availableBalance([{ delta: 10 }, { delta: -50 }], '2026-07-01T00:00:00Z'), 0);
});
