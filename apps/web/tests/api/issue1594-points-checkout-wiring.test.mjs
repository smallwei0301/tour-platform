/**
 * Issue #1594 — 點數 checkout 折抵＋完成發點掛點＋餘額 UI 契約測試。
 * 含 grantCompletionRewards 執行期冪等測試（in-memory）＋各接線源碼契約。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { grantCompletionRewards } from '../../src/lib/order-completion-rewards.mjs';
import { getPointsBalanceDb, __resetMemLedger } from '../../src/lib/db-points.mjs';
import { listNotificationsDb, __resetMemNotifications } from '../../src/lib/db-notifications.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const NOW = '2026-07-05T00:00:00Z';

test('T1594wire.1 — grantCompletionRewards：發點入帳＋一則通知，重跑冪等', async () => {
  __resetMemLedger();
  __resetMemNotifications();
  const r1 = await grantCompletionRewards({ userId: 'u1', orderId: 'o1', paidTwd: 4380, now: NOW });
  assert.equal(r1.earned, 43); // 4380 × 1%
  assert.equal(await getPointsBalanceDb({ userId: 'u1', now: NOW }), 43);
  const list1 = await listNotificationsDb({ userId: 'u1' });
  assert.equal(list1.items.length, 1);
  assert.equal(list1.items[0].type, 'order_status');

  // 重跑（sweep 再跑 / 重複完成）→ 不重複發點、不重複通知
  const r2 = await grantCompletionRewards({ userId: 'u1', orderId: 'o1', paidTwd: 4380, now: NOW });
  assert.equal(r2.earned, 0);
  assert.equal(await getPointsBalanceDb({ userId: 'u1', now: NOW }), 43);
  assert.equal((await listNotificationsDb({ userId: 'u1' })).items.length, 1);
});

test('T1594wire.2 — 發點金額 ≤0 或缺 user/order 不動作', async () => {
  __resetMemLedger();
  __resetMemNotifications();
  assert.equal((await grantCompletionRewards({ userId: '', orderId: 'o1', paidTwd: 100 })).earned, 0);
  assert.equal((await grantCompletionRewards({ userId: 'u1', orderId: 'o1', paidTwd: 0 })).earned, 0);
});

test('T1594wire.3 — 兩個完成 seam 都掛發點（auto-complete sweep＋guide redeem）', () => {
  const sweep = read('src/lib/db-auto-complete.mjs');
  assert.match(sweep, /grantCompletionRewards/);
  assert.match(sweep, /select\([^)]*user_id[^)]*total_twd/);
  const redeem = read('src/lib/db-redeem.mjs');
  assert.match(redeem, /grantCompletionRewards/);
  assert.match(redeem, /select\([^)]*user_id[^)]*total_twd/);
});

test('T1594wire.4 — draft route 收 redeemPoints → redeemPointsForOrderDb → discount_amount', () => {
  const src = read('app/api/v2/bookings/draft/route.ts');
  assert.match(src, /redeemPoints/);
  assert.match(src, /import\s*\{\s*redeemPointsForOrderDb\s*\}/);
  assert.match(src, /redeemPointsForOrderDb\(\{/);
  assert.match(src, /discount_amount:\s*redeemed/);
});

test('T1594wire.5 — /api/me/points＋餘額晶片＋checkout 折抵器＋booking body 接線', () => {
  const route = read('app/api/me/points/route.ts');
  assert.match(route, /getPointsBalanceDb/);
  const chip = read('src/components/me/PointsBalanceChip.tsx');
  assert.match(chip, /\/api\/me\/points/);
  const redeem = read('src/components/activity/CheckoutPointsRedeem.tsx');
  assert.match(redeem, /maxRedeemable/);
  assert.match(redeem, /\/api\/me\/points/);
  const page = read('app/booking/[activityId]/page.tsx');
  assert.match(page, /<CheckoutPointsRedeem/);
  assert.match(page, /redeemPoints:\s*redeemPoints\s*>\s*0/);
  assert.match(page, /payTotal/);
  const orders = read('app/me/orders/page.tsx');
  assert.match(orders, /<PointsBalanceChip\s*\/>/);
});
