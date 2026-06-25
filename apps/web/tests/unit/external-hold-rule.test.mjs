import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExternalHoldRequest } from '../../src/lib/availability-v2/external-hold-rule.ts';

// 這支測試鎖定 evaluateExternalHoldRequest 與 SQL fn_book_schedule 的容量語意一致
// （#1376：純函式必須鏡像 DB 端，否則綠燈不代表 production 正確）。

test('允許：剩餘名額足夠時登記外部佔位', () => {
  const d = evaluateExternalHoldRequest({
    capacity: 10, bookedCount: 3, scheduleStatus: 'open', requestedParticipants: 4,
  });
  assert.equal(d.allowed, true);
  assert.equal(d.remainingBefore, 7);
  assert.equal(d.remainingAfter, 3);
  assert.equal(d.reasonCode, undefined);
});

test('允許邊界：剛好用完所有剩餘名額', () => {
  const d = evaluateExternalHoldRequest({
    capacity: 6, bookedCount: 2, scheduleStatus: 'open', requestedParticipants: 4,
  });
  assert.equal(d.allowed, true);
  assert.equal(d.remainingAfter, 0);
});

test('拒絕：超出剩餘名額 → CAPACITY_EXCEEDED（鏡像 insufficient_capacity）', () => {
  const d = evaluateExternalHoldRequest({
    capacity: 10, bookedCount: 8, scheduleStatus: 'open', requestedParticipants: 3,
  });
  assert.equal(d.allowed, false);
  assert.equal(d.reasonCode, 'CAPACITY_EXCEEDED');
  assert.equal(d.remainingBefore, 2);
  assert.equal(d.remainingAfter, 2);
  assert.match(d.messageZh, /剩餘 2/);
});

test('拒絕：場次非 open（額滿/關閉）→ SCHEDULE_NOT_OPEN', () => {
  for (const status of ['full', 'cancelled', 'closed']) {
    const d = evaluateExternalHoldRequest({
      capacity: 10, bookedCount: 0, scheduleStatus: status, requestedParticipants: 1,
    });
    assert.equal(d.allowed, false, `status=${status}`);
    assert.equal(d.reasonCode, 'SCHEDULE_NOT_OPEN');
  }
});

test('拒絕：人數 < 1 → INVALID_COUNT', () => {
  for (const n of [0, -1, 0.4]) {
    const d = evaluateExternalHoldRequest({
      capacity: 10, bookedCount: 0, scheduleStatus: 'open', requestedParticipants: n,
    });
    assert.equal(d.allowed, false, `n=${n}`);
    assert.equal(d.reasonCode, 'INVALID_COUNT');
  }
});

test('防呆：已超賣（booked > capacity）時 remainingBefore 不為負，且仍拒絕新佔位', () => {
  const d = evaluateExternalHoldRequest({
    capacity: 5, bookedCount: 8, scheduleStatus: 'open', requestedParticipants: 1,
  });
  assert.equal(d.remainingBefore, 0);
  assert.equal(d.allowed, false);
  assert.equal(d.reasonCode, 'CAPACITY_EXCEEDED');
});

test('小數人數向下取整後判定', () => {
  const d = evaluateExternalHoldRequest({
    capacity: 10, bookedCount: 0, scheduleStatus: 'open', requestedParticipants: 2.9,
  });
  assert.equal(d.allowed, true);
  assert.equal(d.remainingAfter, 8);
});
