import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCanonicalAvailabilityState,
} from '../../src/lib/availability-v2/effective-availability-resolver.ts';
import { evaluateEffectiveBookingAvailability } from '../../src/lib/availability-v2/effective-booking-availability.ts';

const TZ = 'Asia/Taipei';

const BASE_INPUT = {
  guideId: 'g-1067',
  activityId: 'a-1067',
  planId: 'p-1067',
  timezone: TZ,
  participants: 2,
  dateFrom: '2026-04-10',
  dateTo: '2026-04-10',
  requestedStartAt: '2026-04-10T09:00:00+08:00',
  minParticipants: 1,
  blackouts: [],
  plan: {
    id: 'p-1067',
    activity_id: 'a-1067',
    duration_minutes: 180,
    max_participants: 10,
    booking_type: 'scheduled',
  },
};

function weekdayRule({ weekday, start = '09:00', end = '12:00' }) {
  return {
    id: `r-${weekday}-${start}`,
    guide_id: 'g-1067',
    activity_plan_id: 'p-1067',
    weekday,
    start_time_local: start,
    end_time_local: end,
    timezone: TZ,
    slot_interval_minutes: 180,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    effective_from: null,
    effective_to: null,
    is_active: true,
  };
}

function season({ startMonth, startDay, endMonth, endDay, isActive = true }) {
  return {
    id: `season-${startMonth}-${startDay}-${endMonth}-${endDay}`,
    activity_plan_id: 'p-1067',
    start_month: startMonth,
    start_day: startDay,
    end_month: endMonth,
    end_day: endDay,
    timezone: TZ,
    is_active: isActive,
  };
}

test('GH-1067 RED: cross-year season allows April slot and blocks July slot', () => {
  const seasons = [season({ startMonth: 11, startDay: 1, endMonth: 4, endDay: 30 })];

  const april = resolveCanonicalAvailabilityState({
    requestedStartAt: '2026-04-10T09:00:00+08:00',
    timezone: TZ,
    rules: [weekdayRule({ weekday: 5 })],
    blackouts: [],
    bookings: [],
    seasons,
    seasonGateEnabled: true,
    planStatus: 'active',
    slotAvailable: true,
    capacityAvailable: true,
  });
  assert.equal(april.state, 'available');

  const july = resolveCanonicalAvailabilityState({
    requestedStartAt: '2026-07-10T09:00:00+08:00',
    timezone: TZ,
    rules: [weekdayRule({ weekday: 5 })],
    blackouts: [],
    bookings: [],
    seasons,
    seasonGateEnabled: true,
    planStatus: 'active',
    slotAvailable: true,
    capacityAvailable: true,
  });
  assert.equal(july.state, 'outside_season');
});

test('GH-1067 RED: no active season rows must fail closed outside_season', () => {
  const out = resolveCanonicalAvailabilityState({
    requestedStartAt: '2026-04-10T09:00:00+08:00',
    timezone: TZ,
    rules: [weekdayRule({ weekday: 5 })],
    blackouts: [],
    bookings: [],
    seasons: [],
    seasonGateEnabled: true,
    planStatus: 'active',
    slotAvailable: true,
    capacityAvailable: true,
  });
  assert.equal(out.state, 'outside_season');
  assert.equal(out.metadata?.seasonGate, 'no_active_season');
});

test('GH-1067 RED: overlapping active booking blocks half-day/full-day combinations as blocked_by_conflict', () => {
  const state = resolveCanonicalAvailabilityState({
    requestedStartAt: '2026-04-10T09:00:00+08:00',
    requestedEndAt: '2026-04-10T12:00:00+08:00',
    timezone: TZ,
    rules: [weekdayRule({ weekday: 5 })],
    blackouts: [],
    bookings: [
      {
        id: 'b-full',
        guide_id: 'g-1067',
        start_at: '2026-04-10T09:00:00+08:00',
        end_at: '2026-04-10T17:00:00+08:00',
        status: 'confirmed',
      },
    ],
    seasons: [season({ startMonth: 1, startDay: 1, endMonth: 12, endDay: 31 })],
    planStatus: 'active',
    slotAvailable: false,
    slotUnavailableReason: 'BOOKING_CONFLICT',
    capacityAvailable: true,
  });

  assert.equal(state.state, 'blocked_by_conflict');
});

test('GH-1067 RED: evaluator-level canonical conflict check blocks same-guide overlap before availability', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE_INPUT,
    rules: [weekdayRule({ weekday: 5, end: '17:00' })],
    bookings: [
      {
        id: 'b-full',
        guide_id: 'g-1067',
        activity_id: 'a-1067',
        activity_plan_id: 'p-1067',
        start_at: '2026-04-10T09:00:00+08:00',
        end_at: '2026-04-10T17:00:00+08:00',
        status: 'confirmed',
      },
    ],
    seasons: [season({ startMonth: 1, startDay: 1, endMonth: 12, endDay: 31 })],
  });

  assert.equal(out.available, false);
  assert.equal(out.canonicalState, 'blocked_by_conflict');
  assert.equal(out.reasonCode, 'blocked_by_conflict');
  assert.equal(out.evaluation.slots.length > 0, true);
});

test('GH-1067 RED: effective booking evaluator propagates outside_season canonical reason for stale draft payload reject', () => {
  const out = evaluateEffectiveBookingAvailability({
    ...BASE_INPUT,
    rules: [weekdayRule({ weekday: 5 })],
    bookings: [],
    seasons: [],
  });

  assert.equal(out.available, false);
  assert.equal(out.reasonCode, 'outside_season');
});
