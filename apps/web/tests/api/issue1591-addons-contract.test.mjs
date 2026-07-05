/**
 * Issue #1591 — 加購 db 層（in-memory fallback）契約測試。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listActivityAddonsDb, persistOrderAddonsDb, __seedMemAddons, __getMemOrderAddons, __resetMemOrderAddons,
} from '../../src/lib/db-addons.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('T1591db.1 — list 只回啟用項、依 sort_order', async () => {
  __seedMemAddons([
    { id: 'a2', activity_id: 'act1', name: '器材', price_twd: 300, unit: 'per_group', stock: 5, is_active: true, sort_order: 2 },
    { id: 'a1', activity_id: 'act1', name: '午餐', price_twd: 200, unit: 'per_person', stock: null, is_active: true, sort_order: 1 },
    { id: 'a0', activity_id: 'act1', name: '下架', price_twd: 100, unit: 'per_person', stock: null, is_active: false, sort_order: 0 },
    { id: 'x', activity_id: 'other', name: '別活動', price_twd: 50, unit: 'per_person', stock: null, is_active: true, sort_order: 0 },
  ]);
  const list = await listActivityAddonsDb('act1');
  assert.deepEqual(list.map((a) => a.id), ['a1', 'a2']); // 啟用＋sort，下架與別活動排除
});

test('T1591db.2 — persist：以 DB 快照重算、只落成功項、回總額（server 不信任前端金額）', async () => {
  __seedMemAddons([
    { id: 'meal', activity_id: 'act1', name: '午餐', price_twd: 200, unit: 'per_person', stock: null, is_active: true, sort_order: 1 },
    { id: 'gear', activity_id: 'act1', name: '器材', price_twd: 300, unit: 'per_group', stock: 1, is_active: true, sort_order: 2 },
  ]);
  __resetMemOrderAddons();
  const r = await persistOrderAddonsDb({
    orderId: 'ord1', activityId: 'act1', peopleCount: 2,
    selections: [
      { addonId: 'meal', quantity: 1 },  // 200*1*2 = 400
      { addonId: 'gear', quantity: 5 },  // stock 1 < 5 → error，不落
    ],
  });
  assert.equal(r.total, 400);
  const persisted = __getMemOrderAddons();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].addon_id, 'meal');
  assert.equal(persisted[0].unit_price_twd, 200); // 快照為 DB 價，非前端傳入
  assert.equal(persisted[0].subtotal_twd, 400);
});

test('T1591db.3 — strangler：加購邏輯不進 db.mjs', () => {
  const dbSrc = readFileSync(path.join(ROOT, 'src/lib/db.mjs'), 'utf8');
  assert.ok(!/listActivityAddonsDb|persistOrderAddonsDb/.test(dbSrc), '加購 db 不得寫進 db.mjs');
});
