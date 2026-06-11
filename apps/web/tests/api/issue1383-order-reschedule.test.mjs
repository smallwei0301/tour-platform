/**
 * Issue #1383 — 改期流程契約（in-memory 實測 + Supabase source-contract）
 * 比照 issue1384-flow-contract 模式。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import {
  createOrderDb,
  processPaymentCallbackDb,
  createRescheduleRequestDb,
  listRescheduleOptionsDb,
  decideRescheduleRequestDb,
  listGuideRescheduleRequestsDb,
  withdrawRescheduleRequestDb,
} from '../../src/lib/db.mjs';
import { experiences, rescheduleRequests } from '../../src/lib/store.mjs';

const EMAIL = 'reschedule@example.com';

function findSchedule(scheduleId) {
  for (const exp of experiences) {
    const s = (exp.schedules || []).find((x) => x.id === scheduleId);
    if (s) return s;
  }
  return null;
}

async function makePaidOrder({ scheduleId = 'sch_chaishan_0410', peopleCount = 2 } = {}) {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId,
    peopleCount,
    contactName: '改期測試',
    contactPhone: '0911000111',
    contactEmail: EMAIL,
  });
  await processPaymentCallbackDb({ orderId: order.id, tradeNo: `RES-${order.id}` });
  return order;
}

// 把 fixture 場次推到未來，避免 48h 窗口擋住（fixture 日期為 2026-04，已過）
function makeFuture(scheduleId, daysFromNow, { resetBooked = false } = {}) {
  const s = findSchedule(scheduleId);
  const start = new Date(Date.now() + daysFromNow * 86400_000);
  s.startAt = start.toISOString();
  s.endAt = new Date(start.getTime() + 4 * 3600_000).toISOString();
  s.status = 'open';
  if (resetBooked) s.bookedCount = 0;
  return s;
}

test('申請 → 訂單轉 reschedule_requested；requestId 冪等', async () => {
  makeFuture('sch_chaishan_0410', 10);
  makeFuture('sch_chaishan_0403', 12, { resetBooked: true });
  const order = await makePaidOrder();

  const first = await createRescheduleRequestDb({
    orderId: order.id,
    requestId: 'res-0001',
    toScheduleId: 'sch_chaishan_0403',
    contactEmail: EMAIL,
  });
  assert.equal(first.status, 'requested');
  assert.equal(first.orderStatus, 'reschedule_requested');
  assert.equal(first.priorOrderStatus, 'paid');

  const replay = await createRescheduleRequestDb({
    orderId: order.id,
    requestId: 'res-0001',
    toScheduleId: 'sch_chaishan_0403',
    contactEmail: EMAIL,
  });
  assert.equal(replay.id, first.id, '同 requestId 應冪等');
});

test('guide approve → 原子轉移：新場次扣位、舊場次回補、訂單回原狀態與新場次', async () => {
  const from = makeFuture('sch_chaishan_0410', 10);
  const to = makeFuture('sch_chaishan_0403', 12, { resetBooked: true });
  const order = await makePaidOrder({ peopleCount: 2 });
  const fromBooked = from.bookedCount;
  const toBooked = to.bookedCount;

  const req = await createRescheduleRequestDb({
    orderId: order.id, requestId: `res-a-${order.id}`, toScheduleId: to.id, contactEmail: EMAIL,
  });
  const decided = await decideRescheduleRequestDb({ requestId: req.id, action: 'approve', resolver: 'guide' });

  assert.equal(decided.status, 'approved');
  assert.equal(decided.orderStatus, 'paid', '訂單應回申請前狀態');
  assert.equal(to.bookedCount, toBooked + 2, '新場次扣位');
  assert.equal(from.bookedCount, fromBooked - 2, '舊場次回補');
  assert.equal(decided.order.scheduleId, to.id, '訂單應指向新場次');
});

test('approve 時新場次容量不足 → 失敗且一切不變（原子性）', async () => {
  const from = makeFuture('sch_chaishan_0410', 10);
  const to = makeFuture('sch_chaishan_0403', 12, { resetBooked: true });
  const order = await makePaidOrder({ peopleCount: 2 });
  const req = await createRescheduleRequestDb({
    orderId: order.id, requestId: `res-b-${order.id}`, toScheduleId: to.id, contactEmail: EMAIL,
  });

  // 申請後把新場次塞滿
  const fromBooked = from.bookedCount;
  to.bookedCount = to.capacity;

  await assert.rejects(
    () => decideRescheduleRequestDb({ requestId: req.id, action: 'approve', resolver: 'guide' }),
    /INSUFFICIENT_CAPACITY/
  );
  assert.equal(from.bookedCount, fromBooked, '舊場次不得變動');
  const stored = rescheduleRequests.find((r) => r.id === req.id);
  assert.equal(stored.status, 'requested', '申請維持 requested（可改選其他場次前先撤回）');
  to.bookedCount = 0;
});

test('reject → 訂單回原狀態、場次皆不變', async () => {
  const from = makeFuture('sch_chaishan_0410', 10);
  const to = makeFuture('sch_chaishan_0403', 12, { resetBooked: true });
  const order = await makePaidOrder({ peopleCount: 1 });
  const fromBooked = from.bookedCount;
  const toBooked = to.bookedCount;

  const req = await createRescheduleRequestDb({
    orderId: order.id, requestId: `res-c-${order.id}`, toScheduleId: to.id, contactEmail: EMAIL,
  });
  const decided = await decideRescheduleRequestDb({ requestId: req.id, action: 'reject', resolver: 'guide', note: '當日已有私人行程' });

  assert.equal(decided.status, 'rejected');
  assert.equal(decided.orderStatus, 'paid');
  assert.equal(from.bookedCount, fromBooked);
  assert.equal(to.bookedCount, toBooked);
});

test('每訂單限 1 次：approve 後再申請 → RESCHEDULE_LIMIT_REACHED', async () => {
  const to = makeFuture('sch_chaishan_0403', 12, { resetBooked: true });
  makeFuture('sch_chaishan_0410', 10);
  const order = await makePaidOrder({ peopleCount: 1 });
  const req = await createRescheduleRequestDb({
    orderId: order.id, requestId: `res-d-${order.id}`, toScheduleId: to.id, contactEmail: EMAIL,
  });
  await decideRescheduleRequestDb({ requestId: req.id, action: 'approve', resolver: 'guide' });

  await assert.rejects(
    () => createRescheduleRequestDb({
      orderId: order.id, requestId: `res-d2-${order.id}`, toScheduleId: 'sch_chaishan_0410', contactEmail: EMAIL,
    }),
    /RESCHEDULE_LIMIT_REACHED/
  );
});

test('72h lazy expire：逾時申請在 guide 清單讀取時轉 expired、訂單回原狀態', async () => {
  const to = makeFuture('sch_chaishan_0403', 12, { resetBooked: true });
  makeFuture('sch_chaishan_0410', 10);
  const order = await makePaidOrder({ peopleCount: 1 });
  const req = await createRescheduleRequestDb({
    orderId: order.id, requestId: `res-e-${order.id}`, toScheduleId: to.id, contactEmail: EMAIL,
  });

  const stored = rescheduleRequests.find((r) => r.id === req.id);
  stored.requestedAt = new Date(Date.now() - 73 * 3600_000).toISOString();

  const list = await listGuideRescheduleRequestsDb({ guideSlug: 'andy-lee' });
  const expired = list.find((r) => r.id === req.id);
  assert.equal(expired?.status, 'expired');
  assert.equal(expired?.orderStatus, 'paid', '逾時後訂單應回原狀態');
});

test('撤回：traveler withdraw → 訂單回原狀態', async () => {
  const to = makeFuture('sch_chaishan_0403', 12, { resetBooked: true });
  makeFuture('sch_chaishan_0410', 10);
  const order = await makePaidOrder({ peopleCount: 1 });
  const req = await createRescheduleRequestDb({
    orderId: order.id, requestId: `res-f-${order.id}`, toScheduleId: to.id, contactEmail: EMAIL,
  });
  const withdrawn = await withdrawRescheduleRequestDb({ requestId: req.id, contactEmail: EMAIL });
  assert.equal(withdrawn.status, 'withdrawn');
  assert.equal(withdrawn.orderStatus, 'paid');
});

test('改期選項：同活動未來 open 且有餘額的場次，排除原場次', async () => {
  makeFuture('sch_chaishan_0410', 10);
  const to = makeFuture('sch_chaishan_0403', 12, { resetBooked: true });
  const order = await makePaidOrder({ peopleCount: 2 });
  const options = await listRescheduleOptionsDb({ orderId: order.id, contactEmail: EMAIL });
  assert.ok(options.some((o) => o.id === to.id), '應含可改場次');
  assert.ok(!options.some((o) => o.id === order.scheduleId), '不得含原場次');
});

test('窗外（<48h）申請 → RESCHEDULE_WINDOW_CLOSED', async () => {
  makeFuture('sch_chaishan_0403', 12, { resetBooked: true });
  const from = makeFuture('sch_chaishan_0410', 1); // 24h 後開始
  const order = await makePaidOrder({ peopleCount: 1, scheduleId: from.id });
  await assert.rejects(
    () => createRescheduleRequestDb({
      orderId: order.id, requestId: `res-g-${order.id}`, toScheduleId: 'sch_chaishan_0403', contactEmail: EMAIL,
    }),
    /RESCHEDULE_WINDOW_CLOSED/
  );
});

// ── Supabase 分支 source-contract（NOT_VERIFIED-live）────────────────────────

test('Supabase 分支：gateway 以 hasSupabaseEnv 分流，approve 走 atomic RPC', () => {
  const dbSrc = readFileSync(path.resolve('src/lib/db.mjs'), 'utf8');
  for (const fn of ['createRescheduleRequestDb', 'listRescheduleOptionsDb', 'decideRescheduleRequestDb', 'listGuideRescheduleRequestsDb', 'withdrawRescheduleRequestDb']) {
    assert.match(dbSrc, new RegExp(`export async function ${fn}`), `db.mjs 應有 ${fn}`);
  }
  assert.match(dbSrc, /fn_reschedule_booking_atomic/, 'approve 應呼叫 atomic RPC');
});

test('migration：reschedule_requests 表 + RPC 鎖序 orders → bookings → activity_schedules', () => {
  const p = path.resolve('../../supabase/migrations/20260611_issue1383_reschedule_requests.sql');
  assert.ok(existsSync(p), 'migration 應存在（timestamp 制）');
  const sql = readFileSync(p, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS.*reschedule_requests/s);
  assert.match(sql, /amount_delta_twd/, '應預留金額欄位（第二期跨價方案）');
  assert.match(sql, /fn_reschedule_booking_atomic/);

  const fnBody = sql.slice(sql.indexOf('fn_reschedule_booking_atomic'));
  const orderLock = fnBody.indexOf('FROM orders');
  const bookingLock = fnBody.indexOf('FROM bookings');
  const scheduleLock = fnBody.indexOf('FROM activity_schedules');
  assert.ok(orderLock > 0 && orderLock < scheduleLock, '鎖序：orders 應先於 activity_schedules');
  if (bookingLock > 0) {
    assert.ok(orderLock < bookingLock && bookingLock < scheduleLock, '鎖序：orders → bookings → activity_schedules');
  }
  assert.match(fnBody, /FOR UPDATE/, 'RPC 應使用 FOR UPDATE');
  assert.match(fnBody, /ORDER BY id/, '雙場次應依 id 排序鎖定（防互等）');
});
