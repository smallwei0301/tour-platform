import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCanonicalAvailabilityState,
} from '../../src/lib/availability-v2/effective-availability-resolver.ts';
import {
  evaluateEffectiveBookingAvailability,
  shouldRejectDraftByLegacySlotAvailability,
} from '../../src/lib/availability-v2/effective-booking-availability.ts';
import { pickFallbackDraftSelectedSchedule } from '../../src/lib/booking-v2-selected-schedule.ts';

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

// Issue #1239 product decision: when no `activity_plan_seasons` rows exist
// (or none are active), the plan is treated as 全部開放 / all-year open.
// Only explicit active season windows restrict outside dates.
//
// PR #1230 added an `isYearRound` flag so admins can *explicitly* mark a
// plan as year-round and surface that to the UI. Both paths reach
// `available` — they differ only in the metadata reason the UI sees:
//   - `isYearRound: true` → reason `'explicit_year_round'`
//   - empty / inactive seasons (no explicit flag) → reason `'no_active_season'`
test('GH-1067: explicit year-round plan passes season gate with no rows + carries metadata', () => {
  const out = resolveCanonicalAvailabilityState({
    requestedStartAt: '2026-04-10T09:00:00+08:00',
    timezone: TZ,
    rules: [weekdayRule({ weekday: 5 })],
    blackouts: [],
    bookings: [],
    seasons: [],
    seasonGateEnabled: true,
    planStatus: 'active',
    isYearRound: true,
    slotAvailable: true,
    capacityAvailable: true,
  });
  assert.equal(out.state, 'available');
  assert.equal(out.metadata?.seasonGate, 'explicit_year_round');
});

test('GH-1067 / #1239: no active season rows → fail open without explicit year-round flag', () => {
  const out = resolveCanonicalAvailabilityState({
    requestedStartAt: '2026-04-10T09:00:00+08:00',
    timezone: TZ,
    rules: [weekdayRule({ weekday: 5 })],
    blackouts: [],
    bookings: [],
    seasons: [],
    seasonGateEnabled: true,
    planStatus: 'active',
    // intentionally no isYearRound flag — #1239's whole point is that admins
    // shouldn't have to set one to get sensible default behaviour.
    slotAvailable: true,
    capacityAvailable: true,
  });
  assert.equal(out.state, 'available');
});

test('GH-1067: disabled seasons do not imply year-round when explicit flag is false', () => {
  const out = resolveCanonicalAvailabilityState({
    requestedStartAt: '2026-04-10T09:00:00+08:00',
    timezone: TZ,
    rules: [weekdayRule({ weekday: 5 })],
    blackouts: [],
    bookings: [],
    seasons: [season({ startMonth: 1, startDay: 1, endMonth: 12, endDay: 31, isActive: false })],
    seasonGateEnabled: true,
    planStatus: 'active',
    slotAvailable: true,
    capacityAvailable: true,
  });
  assert.equal(out.state, 'available');
});

test('GH-1067 / #1239: inactive season rows alone also fail open (admin paused all seasons)', () => {
  const out = resolveCanonicalAvailabilityState({
    requestedStartAt: '2026-04-10T09:00:00+08:00',
    timezone: TZ,
    rules: [weekdayRule({ weekday: 5 })],
    blackouts: [],
    bookings: [],
    seasons: [
      // Season exists but is_active=false — same effect as no rows: plan is
      // all-year open until an admin flips one back to active.
      { id: 's1', activity_plan_id: 'p1', start_month: 6, start_day: 1, end_month: 8, end_day: 31, is_active: false },
    ],
    seasonGateEnabled: true,
    planStatus: 'active',
    slotAvailable: true,
    capacityAvailable: true,
  });
  assert.equal(out.state, 'available');
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

test('GH-1067 / #1239: booking evaluator treats empty seasons as 全部開放 (was: outside_season reject)', () => {
  // Per #1239 the season gate is now fail-open when no active rows exist.
  // The evaluator must therefore stop rejecting valid drafts whose plan has
  // simply not had any season configured yet.
  const out = evaluateEffectiveBookingAvailability({
    ...BASE_INPUT,
    rules: [weekdayRule({ weekday: 5 })],
    bookings: [],
    seasons: [],
  });

  assert.equal(out.available, true);
});

test('GH-1067 / #1239: authoritative selected schedule with empty seasons is never rejected as outside_season', () => {
  // Per #1239 the season gate is fail-open when no active rows exist. An
  // authoritative selected schedule on such a plan must therefore NOT be
  // rejected with `outside_season` — admins should not have to set a
  // year-round flag first. (The evaluator may still reject for orthogonal
  // reasons like missing-from-generated-slots; those are covered by other
  // tests in this file. The contract this test locks down is the
  // narrower one: the season gate stops contributing to the rejection.)
  const out = evaluateEffectiveBookingAvailability({
    ...BASE_INPUT,
    rules: [weekdayRule({ weekday: 5 })],
    bookings: [],
    seasons: [],
    selectedScheduleAuthority: 'authoritative',
    selectedSchedule: {
      id: 'schedule-1067',
      activity_id: 'a-1067',
      plan_id: 'p-1067',
      start_at: '2026-04-10T09:00:00+08:00',
      end_at: '2026-04-10T12:00:00+08:00',
      capacity: 10,
      booked_count: 0,
      status: 'open',
    },
  });

  assert.notEqual(out.canonicalState, 'outside_season');
  assert.notEqual(out.reasonCode, 'outside_season');
});

test('GH-1067 RED: draft must defer legacy conflict reject when active rules already validate the selected schedule canonically', () => {
  const reject = shouldRejectDraftByLegacySlotAvailability({
    hasActiveAvailabilityRules: true,
    scheduleValidatedBySourceOfTruth: true,
    slotValidation: {
      available: false,
      reason: 'BOOKING_CONFLICT',
    },
  });

  assert.equal(reject, false);
});

test('GH-1067 RED: no-rules legacy selected schedule still keeps conflict/blackout safety reject', () => {
  const reject = shouldRejectDraftByLegacySlotAvailability({
    hasActiveAvailabilityRules: false,
    scheduleValidatedBySourceOfTruth: true,
    slotValidation: {
      available: false,
      reason: 'BOOKING_CONFLICT',
    },
  });

  assert.equal(reject, true);
});

test('GH-1067 RED: slot-in-past remains a hard reject even when canonical selected schedule validates', () => {
  const reject = shouldRejectDraftByLegacySlotAvailability({
    hasActiveAvailabilityRules: true,
    scheduleValidatedBySourceOfTruth: true,
    slotValidation: {
      available: false,
      reason: 'SLOT_IN_PAST',
    },
  });

  assert.equal(reject, true);
});

test('GH-1067 RED: fallback selected schedule must keep scanning until it finds a valid exact candidate', () => {
  const fallback = pickFallbackDraftSelectedSchedule({
    schedules: [
      {
        id: 'too-full',
        activity_id: 'a-1',
        plan_id: 'p-1',
        start_at: '2026-07-01T09:00:00+08:00',
        status: 'open',
        capacity: 2,
        booked_count: 2,
      },
      {
        id: 'exact-match',
        activity_id: 'a-1',
        plan_id: 'p-1',
        start_at: '2026-07-01T09:00:00+08:00',
        status: 'open',
        capacity: 10,
        booked_count: 2,
      },
    ],
    activityId: 'a-1',
    resolvedPlanId: 'p-1',
    requestStartAt: '2026-07-01T09:00:00+08:00',
    slotDate: '2026-07-01',
    timezone: 'Asia/Taipei',
    participants: 4,
  });

  assert.ok(fallback);
  assert.equal(fallback?.schedule.id, 'exact-match');
  assert.equal(fallback?.validation.available, true);
});
