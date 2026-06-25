import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateOverrideDynamicSlots } from '../../src/lib/availability-v2/override-dynamic-slots.ts';

// 即時(instant)方案,導遊規則產生 09:00 時段,但被「不同方案(半日)」的既有預約
// 09:00-12:00 跨方案擋住。管理者對全日方案 09:00-17:00 加開 override。
const FULL_PLAN_ID = 'p-full';
const HALF_BOOKING = {
  id: 'b-half',
  guide_id: 'g-1',
  start_at: '2030-07-06T09:00:00+08:00',
  end_at: '2030-07-06T12:00:00+08:00',
  status: 'confirmed',
  participants: 2,
  activity_id: 'a-1',
  activity_plan_id: 'p-half', // 不同方案 → 跨方案硬衝突
};

const BASE = {
  guideId: 'g-1',
  activityId: 'a-1',
  planId: FULL_PLAN_ID,
  timezone: 'Asia/Taipei',
  participants: 2,
  dateFrom: '2030-07-06',
  dateTo: '2030-07-06',
  minParticipants: 1,
  blackouts: [],
  bookings: [HALF_BOOKING],
  plan: {
    id: FULL_PLAN_ID,
    activity_id: 'a-1',
    duration_minutes: 480,
    max_participants: 6,
    booking_type: 'instant',
  },
  seasons: [],
  planStatus: 'active',
};

function override(overrides = {}) {
  return {
    id: 'ovr-1',
    guide_id: 'g-1',
    activity_id: 'a-1',
    activity_plan_id: FULL_PLAN_ID,
    start_at: '2030-07-06T09:00:00+08:00',
    end_at: '2030-07-06T17:00:00+08:00',
    reason: '找到幫手，例外加開全日',
    requires_helper: true,
    helper_status: 'required',
    guide_note: '已找到幫手李小幫，請協調',
    admin_note: null,
    status: 'active',
    ...overrides,
  };
}

test('no overrides → empty', () => {
  assert.deepEqual(evaluateOverrideDynamicSlots(BASE, []), []);
  assert.deepEqual(evaluateOverrideDynamicSlots(BASE, undefined), []);
});

test('active override re-opens an instant slot blocked by a cross-plan booking', () => {
  const slots = evaluateOverrideDynamicSlots(BASE, [override()]);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].canonicalState, 'allowed_with_admin_override');
  assert.equal(slots[0].isAvailable, true);
  assert.equal(slots[0].bookingType, 'instant');
  // 動態 override slot 不帶 schedule id（非真實 activity_schedules row）。
  assert.equal(slots[0].scheduleId, null);
  assert.ok(slots[0].conflictOverride, 'slot carries the override snapshot');
  assert.equal(slots[0].conflictOverride.requiresHelper, true);
});

test('override for a different plan is ignored', () => {
  const slots = evaluateOverrideDynamicSlots(BASE, [override({ activity_plan_id: 'p-other' })]);
  assert.equal(slots.length, 0);
});

test('disabled/cancelled override is ignored', () => {
  assert.equal(evaluateOverrideDynamicSlots(BASE, [override({ status: 'disabled' })]).length, 0);
  assert.equal(evaluateOverrideDynamicSlots(BASE, [override({ status: 'cancelled' })]).length, 0);
});

test('override outside the queried date range is ignored', () => {
  const slots = evaluateOverrideDynamicSlots(
    { ...BASE, dateFrom: '2030-07-07', dateTo: '2030-07-07' },
    [override()],
  );
  assert.equal(slots.length, 0);
});

test('override does not bypass capacity — full schedule is not re-opened', () => {
  // 既有同方案佔位已滿(全日方案 max 6,已有 6 人同方案)→ 容量不足,override 不放行。
  const fullBookings = [
    HALF_BOOKING,
    {
      id: 'b-full-existing',
      guide_id: 'g-1',
      start_at: '2030-07-06T09:00:00+08:00',
      end_at: '2030-07-06T17:00:00+08:00',
      status: 'confirmed',
      participants: 6,
      activity_id: 'a-1',
      activity_plan_id: FULL_PLAN_ID, // 同方案,計入容量
    },
  ];
  const slots = evaluateOverrideDynamicSlots({ ...BASE, bookings: fullBookings }, [override()]);
  assert.equal(slots.length, 0);
});

test('override does not bypass blackout', () => {
  const blackout = [
    {
      id: 'bl-1',
      guide_id: 'g-1',
      starts_at: '2030-07-06T00:00:00+08:00',
      ends_at: '2030-07-06T23:59:59+08:00',
      reason: 'guide off',
      source: 'manual',
    },
  ];
  const slots = evaluateOverrideDynamicSlots({ ...BASE, blackouts: blackout }, [override()]);
  assert.equal(slots.length, 0);
});
