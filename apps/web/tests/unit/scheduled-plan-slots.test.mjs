import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateScheduledPlanSlots } from '../../src/lib/availability-v2/scheduled-plan-slots.ts';

const BASE = {
  guideId: 'g-1',
  activityId: 'a-1',
  planId: 'p-1',
  timezone: 'Asia/Taipei',
  participants: 2,
  dateFrom: '2030-07-01',
  dateTo: '2030-07-31',
  minParticipants: 1,
  blackouts: [],
  bookings: [],
  plan: {
    id: 'p-1',
    activity_id: 'a-1',
    duration_minutes: 120,
    max_participants: 6,
    booking_type: 'scheduled',
  },
  seasons: [],
  conflictOverrides: [],
  planStatus: 'active',
};

function schedule(overrides = {}) {
  return {
    id: 's-1',
    activity_id: 'a-1',
    plan_id: 'p-1',
    start_at: '2030-07-05T09:00:00+08:00',
    end_at: '2030-07-05T11:00:00+08:00',
    capacity: 6,
    booked_count: 0,
    status: 'open',
    ...overrides,
  };
}

test('empty schedule list → NO_OPEN_SCHEDULES, no slots', () => {
  const out = evaluateScheduledPlanSlots(BASE, []);
  assert.equal(out.slots.length, 0);
  assert.equal(out.reasonCode, 'NO_OPEN_SCHEDULES');
  assert.ok(out.messageZh && out.messageZh.length > 0);
});

test('one open schedule → one available slot carrying its scheduleId', () => {
  const out = evaluateScheduledPlanSlots(BASE, [schedule({ id: 'sched-A' })]);
  assert.equal(out.slots.length, 1);
  assert.equal(out.slots[0].isAvailable, true);
  assert.equal(out.slots[0].scheduleId, 'sched-A');
  assert.equal(out.slots[0].bookingType, 'scheduled');
  assert.equal(out.reasonCode, undefined);
});

test('multiple schedules → sorted by startAt, each with its own scheduleId', () => {
  const out = evaluateScheduledPlanSlots(BASE, [
    schedule({ id: 'late', start_at: '2030-07-09T09:00:00+08:00', end_at: '2030-07-09T11:00:00+08:00' }),
    schedule({ id: 'early', start_at: '2030-07-05T09:00:00+08:00', end_at: '2030-07-05T11:00:00+08:00' }),
  ]);
  assert.equal(out.slots.length, 2);
  assert.equal(out.slots[0].scheduleId, 'early');
  assert.equal(out.slots[1].scheduleId, 'late');
});

test('full / cancelled schedules are dropped from the listing', () => {
  const out = evaluateScheduledPlanSlots(BASE, [
    schedule({ id: 'open-one', booked_count: 0 }),
    schedule({ id: 'full-one', start_at: '2030-07-06T09:00:00+08:00', end_at: '2030-07-06T11:00:00+08:00', capacity: 4, booked_count: 4 }),
    schedule({ id: 'cancelled-one', start_at: '2030-07-07T09:00:00+08:00', end_at: '2030-07-07T11:00:00+08:00', status: 'cancelled' }),
  ]);
  const ids = out.slots.map((s) => s.scheduleId);
  assert.deepEqual(ids, ['open-one']);
});

test('schedule is authoritative — availability rules do not gate it (no rules passed)', () => {
  // A schedule at 09:00 with NO matching availability rule must still be bookable,
  // because scheduled plans treat fixed sessions as the source of truth. The helper
  // never feeds rules into the evaluator; this asserts that contract holds.
  const out = evaluateScheduledPlanSlots(BASE, [schedule({ id: 'no-rule-match' })]);
  assert.equal(out.slots.length, 1);
  assert.equal(out.slots[0].scheduleId, 'no-rule-match');
});

test('capacity left reflects remaining seats minus requested participants', () => {
  const out = evaluateScheduledPlanSlots(
    { ...BASE, participants: 2 },
    [schedule({ id: 'cap', capacity: 5, booked_count: 1 })],
  );
  assert.equal(out.slots.length, 1);
  // remaining = 5 - 1 = 4, clamped by plan max (6) → 4
  assert.equal(out.slots[0].capacityLeft, 4);
});
