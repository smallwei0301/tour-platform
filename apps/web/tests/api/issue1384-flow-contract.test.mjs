/**
 * Issue #1384 — in-memory fallback 與 Supabase 實作的契約測試
 *
 * 三條關鍵流程（createOrder / payment callback / refund）的契約：
 * 「同輸入 → 同輸出 shape／同狀態轉移」。
 *
 * - in-memory 分支：透過 db.mjs gateway 直接實測（同 ecpay-callback.test.mjs 模式）
 * - Supabase 分支：source-contract 鎖定 db.mjs 對應實作的回傳 mapping 與狀態字串，
 *   以及 fn_process_payment_callback_atomic 的原子序（NOT_VERIFIED-live：未連真 DB，
 *   live 行為由 migration 契約 + production 觀察涵蓋，見
 *   docs/04-tech/04-tech-architecture/12-payment-callback-atomicity.md）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// 強制 in-memory path（操作環境可能帶 SUPABASE_*）
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import { createOrderDb, processPaymentCallbackDb, createRefundRequestDb } from '../../src/lib/db.mjs';
import { experiences, orders } from '../../src/lib/store.mjs';

const dbSrc = readFileSync(path.resolve('src/lib/db.mjs'), 'utf8');
const atomicMigrationSrc = readFileSync(
  path.resolve('../../supabase/migrations/20260423194000_issue195_callback_booking_status_loop.sql'),
  'utf8'
);

// 兩邊實作都必須提供的訂單欄位（shape 契約）
const ORDER_SHAPE_KEYS = [
  'id', 'status', 'totalTwd', 'experienceId', 'experienceSlug', 'scheduleId',
  'scheduleStartAt', 'scheduleEndAt', 'peopleCount',
  'contactName', 'contactPhone', 'contactEmail', 'createdAt', 'paidAt',
];

function makeOrderInput(overrides = {}) {
  return {
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0401',
    peopleCount: 1,
    contactName: '契約測試',
    contactPhone: '0911222333',
    contactEmail: 'contract@example.com',
    ...overrides,
  };
}

// ── 流程一：createOrder ─────────────────────────────────────────────────────

test('contract/createOrder: in-memory 回傳 shape 含全部契約欄位、初始 status=pending_payment', async () => {
  const order = await createOrderDb(makeOrderInput());
  for (const key of ORDER_SHAPE_KEYS) {
    assert.ok(key in order, `in-memory createOrder 回傳缺 ${key}`);
  }
  assert.equal(order.status, 'pending_payment');
  assert.equal(order.paidAt, null);
  assert.equal(order.totalTwd, 2000);
});

test('contract/createOrder: Supabase 分支 mapping 鎖定同一組欄位與初始狀態（source-contract）', () => {
  // createOrderDb 的 Supabase 回傳 mapping 必須涵蓋契約欄位
  const fnStart = dbSrc.indexOf('export async function createOrderDb');
  const fnSrc = dbSrc.slice(fnStart, fnStart + 9000);
  for (const key of ORDER_SHAPE_KEYS) {
    assert.match(fnSrc, new RegExp(`${key}\\s*[:,]`), `Supabase createOrderDb mapping 缺 ${key}`);
  }
  assert.match(fnSrc, /pending_payment/, 'Supabase 初始狀態應為 pending_payment');
});

// ── 流程二：payment callback ────────────────────────────────────────────────

test('contract/paymentCallback: in-memory pending_payment→paid、佔位、replay 冪等 noop', async () => {
  const order = await createOrderDb(makeOrderInput({ scheduleId: 'sch_chaishan_0410', peopleCount: 2 }));
  const exp = experiences.find((e) => e.id === order.experienceId);
  const schedule = exp.schedules.find((s) => s.id === order.scheduleId);
  const before = schedule.bookedCount;

  const first = await processPaymentCallbackDb({ orderId: order.id, tradeNo: 'CONTRACT-1' });
  assert.equal(first.order.status, 'paid');
  assert.ok(first.order.paidAt, 'paid 後應有 paidAt');
  assert.equal(schedule.bookedCount, before + 2, '佔位應扣減容量');

  // replay：狀態與容量都不得再變
  const replay = await processPaymentCallbackDb({ orderId: order.id, tradeNo: 'CONTRACT-1' });
  assert.equal(replay.order.status, 'paid');
  assert.equal(schedule.bookedCount, before + 2, 'replay 不得重複扣位');
});

test('contract/paymentCallback: Supabase 分支走 atomic RPC；RPC 序為 鎖定→replay→守門→扣位→轉態（source-contract，NOT_VERIFIED-live）', () => {
  assert.match(dbSrc, /fn_process_payment_callback_atomic/, 'db.mjs 應呼叫 atomic RPC');

  const lockIdx = atomicMigrationSrc.indexOf('FOR UPDATE');
  const replayIdx = atomicMigrationSrc.indexOf("IN ('paid', 'confirmed', 'completed')");
  const guardIdx = atomicMigrationSrc.indexOf("illegal order status transition");
  const bookIdx = atomicMigrationSrc.indexOf('fn_book_schedule');
  const paidIdx = atomicMigrationSrc.indexOf("SET status = 'paid'");

  assert.ok(lockIdx > 0, 'RPC 應以 SELECT ... FOR UPDATE 鎖定訂單');
  assert.ok(replayIdx > lockIdx, 'replay 冪等檢查應在鎖定之後');
  assert.ok(guardIdx > replayIdx, '非法轉移守門應在 replay 檢查之後');
  assert.ok(bookIdx > guardIdx, '容量扣位應在守門之後');
  assert.ok(paidIdx > bookIdx, '狀態轉移應在扣位成功之後');
});

// ── 流程三：refund ──────────────────────────────────────────────────────────

test('contract/refund: in-memory requested + 訂單→refund_pending + requestId 冪等', async () => {
  const order = await createOrderDb(makeOrderInput({ scheduleId: 'sch_chaishan_0401' }));
  await processPaymentCallbackDb({ orderId: order.id, tradeNo: 'CONTRACT-R1' });

  const requestId = 'contract-refund-0001';
  const first = await createRefundRequestDb({
    orderId: order.id,
    requestId,
    reason: 'weather',
    note: '契約測試',
    contactEmail: 'contract@example.com',
  });
  // 兩邊實作的契約 shape：扁平退款請求物件
  assert.equal(first.status, 'requested');
  assert.ok(first.id, '應有退款請求 id');
  assert.ok(first.requestedAt, '應有 requestedAt');

  const storedOrder = orders.find((o) => o.id === order.id);
  assert.equal(storedOrder.status, 'refund_pending', '訂單應轉 refund_pending');

  const replay = await createRefundRequestDb({
    orderId: order.id,
    requestId,
    reason: 'weather',
    note: '契約測試',
    contactEmail: 'contract@example.com',
  });
  assert.equal(replay.id, first.id, '同 requestId 應回同一筆（冪等）');
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.orderStatus, 'refund_pending');
});

test('contract/refund: Supabase 分支鎖定同狀態字串與 requestId 冪等（source-contract）', () => {
  const fnStart = dbSrc.indexOf('export async function createRefundRequestDb');
  const fnSrc = dbSrc.slice(fnStart, fnStart + 9000);
  assert.match(fnSrc, /requested/, 'Supabase 退款請求初始狀態應為 requested');
  assert.match(fnSrc, /refund_pending/, 'Supabase 訂單應轉 refund_pending');
  assert.match(fnSrc, /request_id|requestId/, 'Supabase 應以 requestId 冪等');
});

// ── 原子性複核文件存在 ───────────────────────────────────────────────────────

test('複核文件: payment callback 原子性結論已文件化', () => {
  const docPath = path.resolve('../../docs/04-tech/04-tech-architecture/12-payment-callback-atomicity.md');
  const doc = readFileSync(docPath, 'utf8');
  assert.match(doc, /fn_process_payment_callback_atomic/);
  assert.match(doc, /FOR UPDATE/);
  assert.match(doc, /20260423194000_issue195_callback_booking_status_loop\.sql/);
});
