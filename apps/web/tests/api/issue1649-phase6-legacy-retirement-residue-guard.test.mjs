/**
 * #1649 Phase 6 — legacy 訂單/退款/payouts routes 退役殘留守門。
 *
 * 已退役刪除（實作整體搬遷至 /api/v2/**）：
 * - `app/api/me/orders/**`（traveler：v2 為獨立實作，Phase 1+2 已接線）
 * - `app/api/admin/{orders,refund-requests,payouts}/**`（實作搬遷至 v2/admin）
 * - `app/api/guide/{bookings,payout,messages,reschedule-requests,orders}/**`
 *   （實作搬遷至 v2/guide；guide 寫入路徑補顯式 CSRF）
 *
 * 守門：
 * 1. legacy route 檔不得回流（重生檔案＝退役破功）。
 * 2. v2 對應實作必須在場（防「刪了 legacy 但 v2 缺角」的半殘狀態）。
 * 3. 凍結區 `app/api/payments/**` 不在本守門範圍（P0-OVERRIDE 協議另管）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const gone = (rel) => assert.ok(!existsSync(path.join(ROOT, rel)), `${rel} 已退役，不得回流`);
const alive = (rel) => assert.ok(existsSync(path.join(ROOT, rel)), `${rel} 必須存在（v2 對應實作）`);

test('traveler legacy /api/me/orders/** 已退役；v2 對應在場', () => {
  gone('app/api/me/orders');
  alive('app/api/v2/orders/route.ts');
  alive('app/api/v2/orders/[orderId]/route.ts');
  alive('app/api/v2/orders/[orderId]/cancel/route.ts');
  alive('app/api/v2/orders/[orderId]/refund-requests/route.ts');
  alive('app/api/v2/orders/[orderId]/reschedule-options/route.ts');
  alive('app/api/v2/orders/[orderId]/reschedule-requests/route.ts');
  alive('app/api/v2/orders/[orderId]/reschedule-requests/[requestId]/route.ts');
  alive('app/api/v2/orders/[orderId]/messages/route.ts');
  alive('app/api/v2/orders/[orderId]/guide-contact/route.ts');
});

test('admin legacy orders/refund-requests/payouts 已退役；v2 對應在場', () => {
  gone('app/api/admin/orders');
  gone('app/api/admin/refund-requests');
  gone('app/api/admin/payouts');
  for (const rel of [
    'app/api/v2/admin/orders/route.ts',
    'app/api/v2/admin/orders/[orderId]/route.ts',
    'app/api/v2/admin/orders/[orderId]/refund-execute/route.ts',
    'app/api/v2/admin/orders/[orderId]/cancel/route.ts',
    'app/api/v2/admin/refund-requests/route.ts',
    'app/api/v2/admin/refund-requests/[refundRequestId]/approve/route.ts',
    'app/api/v2/admin/refund-requests/[refundRequestId]/complete/route.ts',
    'app/api/v2/admin/payouts/route.ts',
    'app/api/v2/admin/payouts/generate/route.ts',
    'app/api/v2/admin/payouts/[payoutId]/confirm/route.ts',
  ]) alive(rel);
});

test('guide legacy bookings/payout/messages/reschedule-requests/orders 已退役；v2 對應在場', () => {
  gone('app/api/guide/bookings');
  gone('app/api/guide/payout');
  gone('app/api/guide/messages');
  gone('app/api/guide/reschedule-requests');
  gone('app/api/guide/orders');
  for (const rel of [
    'app/api/v2/guide/bookings/route.ts',
    'app/api/v2/guide/bookings/[bookingId]/approval/route.ts',
    'app/api/v2/guide/payout/monthly/route.ts',
    'app/api/v2/guide/payout/monthly/csv/route.ts',
    'app/api/v2/guide/messages/route.ts',
    'app/api/v2/guide/orders/[orderId]/messages/route.ts',
    'app/api/v2/guide/reschedule-requests/route.ts',
    'app/api/v2/guide/reschedule-requests/[requestId]/decision/route.ts',
  ]) alive(rel);
});

test('搬遷後 v2 admin/guide routes 不得再是 re-export 殼（實作必須落地 v2）', () => {

  for (const rel of [
    'app/api/v2/admin/orders/route.ts',
    'app/api/v2/admin/orders/[orderId]/refund-execute/route.ts',
    'app/api/v2/guide/bookings/route.ts',
    'app/api/v2/guide/payout/monthly/route.ts',
  ]) {
    const src = readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(!/export \{ [A-Z, ]+ \} from '[.\/]+(admin|guide)\//.test(src), `${rel} 不得殘留 legacy re-export 殼`);
    assert.match(src, /export async function (GET|POST)/, `${rel} 需含實作`);
  }
});

test('guide 寫入 v2 routes 顯式 CSRF（middleware 不涵蓋 /api/v2/guide）', () => {

  for (const rel of [
    'app/api/v2/guide/bookings/[bookingId]/approval/route.ts',
    'app/api/v2/guide/orders/[orderId]/messages/route.ts',
    'app/api/v2/guide/reschedule-requests/[requestId]/decision/route.ts',
  ]) {
    const src = readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(src, /validateCsrf\(req\)/, `${rel} POST 必須顯式 validateCsrf`);
  }
});
