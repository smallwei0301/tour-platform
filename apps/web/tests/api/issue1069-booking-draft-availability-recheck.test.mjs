import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateEffectiveBookingAvailability,
  shouldRejectDraftByEffectiveAvailability,
} from '../../src/lib/availability-v2/effective-booking-availability.ts';

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
  requestedStartAt: `${BOOKABLE_DATE}T09:00:00+08:00`,
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

test('GH-1069 RED: no-slot decision keeps evaluator reason/message for draft reject parity', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE,
    participants: 1,
    minParticipants: 3,
    rules: [ruleAtNine()],
  });

  assert.equal(out.available, false);
  assert.equal(out.reasonCode, 'MIN_PARTICIPANTS_NOT_MET');
  assert.ok(out.messageZh?.length > 0);
});

test('GH-1069 RED: stale schedule fallback only passes when requested startAt exists in effective slots', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE,
    requestedStartAt: `${BOOKABLE_DATE}T10:00:00+08:00`,
    rules: [ruleAtNine()],
  });

  assert.equal(out.available, false);
  assert.equal(out.reasonCode, 'BOOKING_CONFLICT');
});

test('GH-1069 RED: authoritative selected schedule closed/full rejects with canonical conflict reason', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE,
    rules: [ruleAtNine()],
    selectedScheduleAuthority: 'authoritative',
    selectedSchedule: {
      id: 's-closed',
      activity_id: 'a-1',
      plan_id: 'p-1',
      start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
      end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
      capacity: 6,
      booked_count: 0,
      status: 'closed',
    },
  });

  assert.equal(out.available, false);
  assert.equal(out.reasonCode, 'blocked_by_conflict');
});

test('GH-1069 RED: stale schedule fallback cannot bypass effective generated unavailable decision', () => {
  const reject = shouldRejectDraftByEffectiveAvailability({
    scheduleValidatedBySourceOfTruth: true,
    generatedSlotValidation: {
      available: false,
      reasonCode: 'BOOKING_CONFLICT',
    },
  });

  assert.equal(reject, true);
});

test('GH-1069 RED: happy path keeps available=true and matched slot', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE,
    rules: [ruleAtNine()],
  });

  assert.equal(out.available, true);
  assert.equal(out.matchedSlot?.startAt, `${BOOKABLE_DATE}T09:00:00+08:00`);
});

test('GH-1069 RED: authoritative selected schedule keeps draft parity when source-of-truth slot is open, generated rules are absent, and explicit year-round is set', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE,
    plan: {
      ...BASE.plan,
      is_year_round: true,
    },
    rules: [],
    seasons: [],
    selectedScheduleAuthority: 'authoritative',
    selectedSchedule: {
      id: 's-authoritative-open',
      activity_id: 'a-1',
      plan_id: 'p-1',
      start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
      end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
      capacity: 6,
      booked_count: 0,
      status: 'open',
    },
  });

  assert.equal(out.available, true);
  assert.equal(out.matchedSlot?.startAt, `${BOOKABLE_DATE}T09:00:00+08:00`);
  assert.equal(out.evaluation.selectedScheduleAuthority, 'authoritative');
});

test('GH-1069 RED: fallback selected schedule keeps draft parity when recovered exact slot is open, generated rules are absent, and explicit year-round is set', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE,
    plan: {
      ...BASE.plan,
      is_year_round: true,
    },
    rules: [],
    seasons: [],
    selectedScheduleAuthority: 'fallback',
    selectedSchedule: {
      id: 's-fallback-open',
      activity_id: 'a-1',
      plan_id: 'p-1',
      start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
      end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
      capacity: 6,
      booked_count: 1,
      status: 'open',
    },
  });

  assert.equal(out.available, true);
  assert.equal(out.matchedSlot?.startAt, `${BOOKABLE_DATE}T09:00:00+08:00`);
  assert.equal(out.evaluation.selectedScheduleAuthority, 'fallback');
});

test('GH-1067 RED: selected schedule parity bypass must not override active season gate', () => {
  for (const authority of ['authoritative', 'fallback']) {
    const out = evaluateEffectiveBookingAvailability({
      ...BASE,
      rules: [],
      seasons: [
        {
          id: 'season-winter',
          activity_plan_id: 'p-1',
          start_month: 11,
          start_day: 1,
          end_month: 4,
          end_day: 30,
          timezone: 'Asia/Taipei',
          is_active: true,
        },
      ],
      selectedScheduleAuthority: authority,
      selectedSchedule: {
        id: `s-${authority}-outside-season`,
        activity_id: 'a-1',
        plan_id: 'p-1',
        start_at: `${BOOKABLE_DATE}T09:00:00+08:00`,
        end_at: `${BOOKABLE_DATE}T11:00:00+08:00`,
        capacity: 6,
        booked_count: 0,
        status: 'open',
      },
    });

    assert.equal(out.available, false);
    assert.equal(out.reasonCode, 'outside_season');
    assert.equal(out.canonicalState, 'outside_season');
  }
});
