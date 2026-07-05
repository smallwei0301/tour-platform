/**
 * Issue #1594 — 點數 ledger db 層（in-memory fallback）契約測試。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getPointsBalanceDb, earnPointsForOrderDb, redeemPointsForOrderDb, __resetMemLedger,
} from '../../src/lib/db-points.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const NOW = '2026-07-01T00:00:00Z';

test('T1594db.1 — 發點 1%，餘額反映；同訂單重複發點冪等', async () => {
  __resetMemLedger();
  const r1 = await earnPointsForOrderDb({ userId: 'u1', orderId: 'o1', paidTwd: 4380, now: NOW });
  assert.deepEqual(r1, { earned: 43, alreadyEarned: false });
  assert.equal(await getPointsBalanceDb({ userId: 'u1', now: NOW }), 43);
  // 同訂單再發 → 冪等，不重複
  const r2 = await earnPointsForOrderDb({ userId: 'u1', orderId: 'o1', paidTwd: 4380, now: NOW });
  assert.equal(r2.alreadyEarned, true);
  assert.equal(await getPointsBalanceDb({ userId: 'u1', now: NOW }), 43);
});

test('T1594db.2 — 折抵不超過 min(餘額, 訂單×30%)，扣點反映餘額', async () => {
  __resetMemLedger();
  await earnPointsForOrderDb({ userId: 'u1', orderId: 'o1', paidTwd: 100000, now: NOW }); // 1000 點
  // 訂單 2000，上限 600；要折 5000 → 實折 600
  const r = await redeemPointsForOrderDb({ userId: 'u1', orderId: 'o2', requestPoints: 5000, orderTwd: 2000, now: NOW });
  assert.equal(r.redeemed, 600);
  assert.equal(await getPointsBalanceDb({ userId: 'u1', now: NOW }), 400); // 1000 - 600
});

test('T1594db.3 — 過期回饋不計入餘額', async () => {
  __resetMemLedger();
  // 用很久以前的 now 發點（效期 12 月），之後在效期外查餘額
  await earnPointsForOrderDb({ userId: 'u1', orderId: 'o1', paidTwd: 100000, now: '2025-01-01T00:00:00Z' });
  assert.equal(await getPointsBalanceDb({ userId: 'u1', now: '2025-06-01T00:00:00Z' }), 1000); // 效期內
  assert.equal(await getPointsBalanceDb({ userId: 'u1', now: '2027-01-01T00:00:00Z' }), 0);    // 已過期
});

test('T1594db.4 — strangler：點數 db 不進 db.mjs', () => {
  const dbSrc = readFileSync(path.join(ROOT, 'src/lib/db.mjs'), 'utf8');
  assert.ok(!/earnPointsForOrderDb|getPointsBalanceDb/.test(dbSrc), '點數 db 不得寫進 db.mjs');
});
