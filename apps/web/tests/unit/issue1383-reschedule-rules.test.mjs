/**
 * Issue #1383 — 訂單改期：純邏輯（政策時限、資格、目標 slot、逾時失效）
 * 設計：docs/04-tech/04-tech-architecture/13-order-reschedule-design.md
 * 定案參數：每訂單限改 1 次、guide 72h lazy-expire、申請窗 = 行程開始前 168h（7 天）
 *   （owner 2026-06-12 由 48h 調整為 168h；窗內需聯絡客服）
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESCHEDULE_WINDOW_HOURS,
  RESCHEDULE_EXPIRE_HOURS,
  RESCHEDULE_MAX_PER_ORDER,
  canRequestReschedule,
  isRescheduleTargetValid,
  isRescheduleRequestExpired,
} from '../../src/lib/reschedule.mjs';

const NOW = '2026-06-11T00:00:00.000Z';
const START_OK = '2026-06-20T09:00:00.000Z';   // 距 now 9 天（225h）> 168h
const START_SOON = '2026-06-17T09:00:00.000Z'; // 距 now 6.4 天（153h）< 168h

const BASE = {
  orderStatus: 'paid',
  scheduleStartAt: START_OK,
  now: NOW,
  approvedCount: 0,
  hasPendingRequest: false,
};

test('定案參數鎖定：1 次上限 / 72h 失效 / 168h（7 天）申請窗', () => {
  assert.equal(RESCHEDULE_MAX_PER_ORDER, 1);
  assert.equal(RESCHEDULE_EXPIRE_HOURS, 72);
  assert.equal(RESCHEDULE_WINDOW_HOURS, 168);
});

test('資格：paid/confirmed 在窗內可申請', () => {
  assert.equal(canRequestReschedule(BASE).ok, true);
  assert.equal(canRequestReschedule({ ...BASE, orderStatus: 'confirmed' }).ok, true);
});

test('資格：非 paid/confirmed → 403 NOT_ELIGIBLE_STATUS', () => {
  for (const orderStatus of ['pending_payment', 'completed', 'refunded', 'refund_pending', 'reschedule_requested']) {
    const r = canRequestReschedule({ ...BASE, orderStatus });
    assert.equal(r.ok, false, orderStatus);
    assert.equal(r.status, 403);
    assert.equal(r.code, 'NOT_ELIGIBLE_STATUS');
  }
});

test('資格：窗外（<168h）→ 403 RESCHEDULE_WINDOW_CLOSED 且訊息導向客服；已過期行程亦然', () => {
  const soon = canRequestReschedule({ ...BASE, scheduleStartAt: START_SOON });
  assert.equal(soon.ok, false);
  assert.equal(soon.status, 403);
  assert.equal(soon.code, 'RESCHEDULE_WINDOW_CLOSED');
  assert.match(soon.message, /客服/);
  const past = canRequestReschedule({ ...BASE, scheduleStartAt: '2026-06-01T00:00:00.000Z' });
  assert.equal(past.code, 'RESCHEDULE_WINDOW_CLOSED');
});

test('資格：168h 邊界 — 恰滿 168h 可申請，差 1 分鐘即窗外', () => {
  const exactly168 = new Date(new Date(NOW).getTime() + 168 * 3600_000).toISOString();
  assert.equal(canRequestReschedule({ ...BASE, scheduleStartAt: exactly168 }).ok, true);
  const justUnder = new Date(new Date(NOW).getTime() + 168 * 3600_000 - 60_000).toISOString();
  assert.equal(canRequestReschedule({ ...BASE, scheduleStartAt: justUnder }).code, 'RESCHEDULE_WINDOW_CLOSED');
});

test('資格：已改過 1 次 → 409 RESCHEDULE_LIMIT_REACHED；已有申請中 → 409 RESCHEDULE_PENDING', () => {
  const limit = canRequestReschedule({ ...BASE, approvedCount: 1 });
  assert.equal(limit.status, 409);
  assert.equal(limit.code, 'RESCHEDULE_LIMIT_REACHED');

  const pending = canRequestReschedule({ ...BASE, hasPendingRequest: true });
  assert.equal(pending.status, 409);
  assert.equal(pending.code, 'RESCHEDULE_PENDING');
});

test('目標 slot：同 id / 非 open / 已開始 / 容量不足 → 拒絕；合法 → ok', () => {
  const target = { id: 'sch_b', status: 'open', startAt: START_OK, capacity: 10, bookedCount: 4 };
  assert.equal(isRescheduleTargetValid({ fromScheduleId: 'sch_a', target, peopleCount: 2, now: NOW }).ok, true);

  assert.equal(isRescheduleTargetValid({ fromScheduleId: 'sch_b', target, peopleCount: 2, now: NOW }).code, 'SAME_SLOT');
  assert.equal(isRescheduleTargetValid({ fromScheduleId: 'sch_a', target: { ...target, status: 'full' }, peopleCount: 2, now: NOW }).code, 'SLOT_NOT_OPEN');
  assert.equal(isRescheduleTargetValid({ fromScheduleId: 'sch_a', target: { ...target, startAt: '2026-06-10T00:00:00.000Z' }, peopleCount: 2, now: NOW }).code, 'SLOT_IN_PAST');
  assert.equal(isRescheduleTargetValid({ fromScheduleId: 'sch_a', target: { ...target, bookedCount: 9 }, peopleCount: 2, now: NOW }).code, 'INSUFFICIENT_CAPACITY');
  assert.equal(isRescheduleTargetValid({ fromScheduleId: 'sch_a', target: null, peopleCount: 2, now: NOW }).code, 'SLOT_NOT_FOUND');
});

test('72h lazy expire：requested 滿 72h → expired', () => {
  assert.equal(isRescheduleRequestExpired('2026-06-07T23:00:00.000Z', NOW), true);  // 73h 前
  assert.equal(isRescheduleRequestExpired('2026-06-08T01:00:00.000Z', NOW), false); // 71h 前
});
