// #1493 — 逾時未付款自動取消：in-memory 狀態機（冪等／已付款不取消／只掃到期）
// + RPC/sweep/workflow source-contract。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { expireUnpaidOrdersDb } from '../../src/lib/db.mjs';
import { orders } from '../../src/lib/store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';
const NOW = '2025-01-01T00:00:00.000Z';

function resetOrders() {
  orders.splice(0, orders.length);
}

test('只取消已過期且仍 pending_payment 的訂單', async () => {
  resetOrders();
  orders.push(
    { id: 'o_expired', status: 'pending_payment', paymentDeadlineAt: PAST, peopleCount: 1 },
    { id: 'o_future', status: 'pending_payment', paymentDeadlineAt: FUTURE, peopleCount: 1 },
    { id: 'o_paid', status: 'paid', paymentDeadlineAt: PAST, peopleCount: 1 },
    { id: 'o_null', status: 'pending_payment', paymentDeadlineAt: null, peopleCount: 1 },
  );

  const res = await expireUnpaidOrdersDb({ now: NOW });
  assert.equal(res.expired, 1);
  assert.equal(orders.find((o) => o.id === 'o_expired').status, 'cancelled_unpaid');
  assert.equal(orders.find((o) => o.id === 'o_future').status, 'pending_payment');
  assert.equal(orders.find((o) => o.id === 'o_paid').status, 'paid');
  assert.equal(orders.find((o) => o.id === 'o_null').status, 'pending_payment');
  resetOrders();
});

test('冪等：重跑不再取消已取消者', async () => {
  resetOrders();
  orders.push({ id: 'o1', status: 'pending_payment', paymentDeadlineAt: PAST, peopleCount: 2 });
  const first = await expireUnpaidOrdersDb({ now: NOW });
  assert.equal(first.expired, 1);
  const second = await expireUnpaidOrdersDb({ now: NOW });
  assert.equal(second.expired, 0);
  resetOrders();
});

test('expire RPC 鎖序 orders→bookings→activity_schedules + 冪等守門', () => {
  const sql = read('../../supabase/migrations/20260629141000_issue1493_expire_unpaid_order_rpc.sql');
  assert.match(sql, /fn_expire_unpaid_order_atomic/);
  // 鎖序：先 orders FOR UPDATE，再 bookings FOR UPDATE，最後 fn_cancel_booking。
  const orderLock = sql.indexOf('FROM orders WHERE id = p_order_id FOR UPDATE');
  const bookingLock = sql.indexOf('FROM bookings WHERE id = v_order.booking_id FOR UPDATE');
  const scheduleRelease = sql.indexOf('fn_cancel_booking(');
  assert.ok(orderLock > -1 && bookingLock > -1 && scheduleRelease > -1);
  assert.ok(orderLock < bookingLock && bookingLock < scheduleRelease, 'lock order orders→bookings→schedules');
  // 冪等守門：只處理仍 pending_payment 且已到期者。
  assert.match(sql, /v_order\.status <> 'pending_payment'/);
  assert.match(sql, /payment_deadline_at > p_now/);
  assert.match(sql, /cancelled_unpaid/);
  // booking_status_logs 去重（避免重跑重複寫）。
  assert.match(sql, /WHERE NOT EXISTS/);
});

test('sweep route：x-internal-token 授權 + 呼叫 expireUnpaidOrdersDb', () => {
  const src = read('app/api/internal/bookings/unpaid-expiry-sweep/route.ts');
  assert.match(src, /x-internal-token/);
  assert.match(src, /INTERNAL_ALERT_TOKEN/);
  assert.match(src, /status:\s*401/);
  assert.match(src, /expireUnpaidOrdersDb/);
});

test('checkout route 惰性守門：逾期擋下結帳', () => {
  const src = read('app/api/v2/bookings/[bookingId]/checkout/route.ts');
  assert.match(src, /isPaymentExpired/);
  assert.match(src, /payment_deadline_at/);
  assert.match(src, /PAYMENT_DEADLINE_PASSED/);
});

test('GitHub Actions workflow 排程存在（每 30 分鐘）', () => {
  const yml = read('../../.github/workflows/unpaid-expiry-sweep.yml');
  assert.match(yml, /unpaid-expiry-sweep/);
  assert.match(yml, /cron: '\*\/30 \* \* \* \*'/);
  assert.match(yml, /x-internal-token/);
});
