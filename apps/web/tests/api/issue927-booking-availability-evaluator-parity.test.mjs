import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateBookingAvailability } from '../../src/lib/availability-v2/booking-availability-evaluator.ts';

// #admin-plan-revert 後續：原本寫死 '2026-07-01' 的可預約時段會隨時鐘越過而變成過去
// （SLOT_IN_PAST，全 repo 今日皆紅）。改用相對於「現在」的未來日期，測試不再隨日期到期。
const BOOKABLE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);


const BASE = {
  guideId: 'g-1',
  activityId: 'a-1',
  planId: 'p-1',
  timezone: 'Asia/Taipei',
  participants: 2,
  dateFrom: `${BOOKABLE_DATE}`,
  dateTo: `${BOOKABLE_DATE}`,
  minParticipants: 2,
  rules: [],
  blackouts: [],
  bookings: [],
  plan: {
    id: 'p-1',
    activity_id: 'a-1',
    duration_minutes: 120,
    max_participants: 6,
    booking_type: 'scheduled',
  },
};

function evaluate(overrides = {}) {
  return evaluateBookingAvailability({ ...BASE, ...overrides });
}

function ruleAtNine() {
  return {
    id: 'r-1',
    guide_id: 'g-1',
    activity_plan_id: 'p-1',
    weekday: 3,
    start_time_local: '09:00',
    end_time_local: '11:00',
    timezone: 'Asia/Taipei',
    slot_interval_minutes: 120,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    effective_from: null,
    effective_to: null,
    is_active: true,
  };
}

test('GH-927 truth-table: stale/mismatched scheduleId fallback keeps generated path available', () => {
  const out = evaluate({
    rules: [ruleAtNine()],
    selectedScheduleAuthority: 'fallback',
    selectedSchedule: {
      id: 'stale-schedule',
      activity_id: 'a-1',
      plan_id: 'p-1',
      start_at: `${BOOKABLE_DATE}T10:00:00+08:00`,
      end_at: `${BOOKABLE_DATE}T12:00:00+08:00`,
      capacity: 6,
      booked_count: 0,
      status: 'open',
    },
  });

  assert.equal(out.available, false);
  assert.equal(out.selectedScheduleAuthority, 'fallback');
  assert.equal(out.reasonCode, 'BOOKING_CONFLICT');
  assert.equal(out.diagnostics.schedulePresentInGeneratedSlots, false);
});

test('GH-927 truth-table: rules-generated path + blackout blocks booking', () => {
  const out = evaluate({
    rules: [ruleAtNine()],
    blackouts: [
      {
        id: 'b-1',
        guide_id: 'g-1',
        starts_at: `${BOOKABLE_DATE}T00:00:00+08:00`,
        ends_at: `${BOOKABLE_DATE}T23:59:59+08:00`,
        reason: 'guide off',
        source: 'manual',
      },
    ],
  });

  assert.equal(out.available, false);
  assert.equal(out.slots.length, 0);
  assert.equal(out.diagnostics.hasRules, true);
});

test('GH-927 truth-table: same-guide overlap for draft/pending/confirmed blocks, cancelled does not block', () => {
  const withActiveHold = evaluate({
    rules: [ruleAtNine()],
    bookings: [
      {
        id: 'bk-draft',
        guide_id: 'g-1',
        start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
        end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
        status: 'draft',
        participants: 2,
        activity_id: 'a-2',
        activity_plan_id: 'p-2',
      },
      {
        id: 'bk-pending',
        guide_id: 'g-1',
        start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
        end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
        status: 'pending_confirmation',
        participants: 1,
        activity_id: 'a-3',
        activity_plan_id: 'p-3',
      },
      {
        id: 'bk-confirmed',
        guide_id: 'g-1',
        start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
        end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
        status: 'confirmed',
        participants: 1,
        activity_id: 'a-4',
        activity_plan_id: 'p-4',
      },
      {
        id: 'bk-cancelled',
        guide_id: 'g-1',
        start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
        end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
        status: 'cancelled',
        participants: 99,
        activity_id: 'a-9',
        activity_plan_id: 'p-9',
      },
    ],
  });

  assert.equal(withActiveHold.available, false);
  assert.equal(withActiveHold.slots.length, 0);

  const withCancelledOnly = evaluate({
    rules: [ruleAtNine()],
    bookings: [
      {
        id: 'bk-cancelled-only',
        guide_id: 'g-1',
        start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
        end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
        status: 'cancelled',
        participants: 99,
        activity_id: 'a-9',
        activity_plan_id: 'p-9',
      },
    ],
  });

  assert.equal(withCancelledOnly.available, true);
  assert.equal(withCancelledOnly.slots.length, 1);
});

test('GH-927 truth-table: PR-924 hold-overlap and legacy no-rules selectedSchedule behavior both preserved', () => {
  const holdOverlap = evaluate({
    rules: [ruleAtNine()],
    selectedScheduleAuthority: 'authoritative',
    selectedSchedule: {
      id: 's-1',
      activity_id: 'a-1',
      plan_id: 'p-1',
      start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
      end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
      capacity: 6,
      booked_count: 0,
      status: 'open',
    },
    bookings: [
      {
        id: 'same-plan-draft-hold',
        guide_id: 'g-1',
        start_at: `${BOOKABLE_DATE}T07:00:00+08:00`,
        end_at: `${BOOKABLE_DATE}T08:00:00+08:00`,
        status: 'draft',
        participants: 5,
        activity_id: 'a-1',
        activity_plan_id: 'p-1',
      },
    ],
  });

  assert.equal(holdOverlap.available, false);
  assert.equal(holdOverlap.reasonCode, 'BOOKING_CONFLICT');

  const legacyNoRules = evaluate({
    rules: [],
    selectedScheduleAuthority: 'authoritative',
    selectedSchedule: {
      id: 'legacy-no-rules-open',
      activity_id: 'a-1',
      plan_id: null,
      start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
      end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
      capacity: 4,
      booked_count: 1,
      status: 'open',
    },
  });

  assert.equal(legacyNoRules.available, true);
  assert.equal(legacyNoRules.selectedScheduleAuthority, 'authoritative');
  assert.equal(legacyNoRules.slots.length, 1);
  assert.equal(legacyNoRules.slots[0].capacityLeft, 3);
});

test('GH-1067 RED: no-rules selected schedule must still reject same-guide overlapping hold from another activity', () => {
  const overlapReject = evaluate({
    rules: [],
    selectedScheduleAuthority: 'authoritative',
    selectedSchedule: {
      id: 'legacy-no-rules-open-conflict',
      activity_id: 'a-1',
      plan_id: null,
      start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
      end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
      capacity: 4,
      booked_count: 0,
      status: 'open',
    },
    bookings: [
      {
        id: 'other-activity-overlap',
        guide_id: 'g-1',
        start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
        end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
        status: 'draft',
        participants: 4,
        activity_id: 'a-2',
        activity_plan_id: 'p-2',
      },
    ],
  });

  assert.equal(overlapReject.available, false);
  assert.equal(overlapReject.reasonCode, 'BOOKING_CONFLICT');
  assert.equal(overlapReject.slots.length, 0);
});

test('GH-927 truth-table: participants/capacity/max/min produce deterministic allow/deny outcomes', () => {
  const minNotMet = evaluate({
    participants: 1,
    minParticipants: 3,
    rules: [ruleAtNine()],
  });
  assert.equal(minNotMet.available, false);
  assert.equal(minNotMet.reasonCode, 'MIN_PARTICIPANTS_NOT_MET');

  const capacityExceeded = evaluate({
    participants: 4,
    minParticipants: 1,
    plan: {
      ...BASE.plan,
      max_participants: 5,
    },
    rules: [ruleAtNine()],
    bookings: [
      {
        id: 'same-plan-capacity-hold',
        guide_id: 'g-1',
        start_at: `${BOOKABLE_DATE}T08:00:00+08:00`,
        end_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
        status: 'draft',
        participants: 2,
        activity_id: 'a-1',
        activity_plan_id: 'p-1',
      },
    ],
  });
  assert.equal(capacityExceeded.available, false);
  assert.equal(capacityExceeded.reasonCode, 'CAPACITY_EXCEEDED');

  const groupForms = evaluate({
    participants: 2,
    minParticipants: 3,
    rules: [ruleAtNine()],
    bookings: [
      {
        id: 'same-plan-confirmed',
        guide_id: 'g-1',
        start_at: `${BOOKABLE_DATE}T08:00:00+08:00`,
        end_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
        status: 'confirmed',
        participants: 1,
        activity_id: 'a-1',
        activity_plan_id: 'p-1',
      },
    ],
  });
  assert.equal(groupForms.available, true);
  assert.equal(groupForms.reasonCode, undefined);
});
