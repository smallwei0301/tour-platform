import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateBookingAvailability } from '../../src/lib/availability-v2/booking-availability-evaluator.ts';
import { evaluateEffectiveBookingAvailability } from '../../src/lib/availability-v2/effective-booking-availability.ts';

const TZ = 'Asia/Taipei';
const GUIDE_ID = 'g-1067-close-gate';
const ACTIVITY_ID = 'a-1067-close-gate';
const PLAN_ID = 'p-1067-close-gate';
const REQUEST_START = '2026-07-01T09:00:00+08:00';
const REQUEST_END = '2026-07-01T12:00:00+08:00';

function season({ startMonth, startDay, endMonth, endDay, isActive = true }) {
  return {
    id: `season-${startMonth}-${startDay}-${endMonth}-${endDay}`,
    activity_plan_id: PLAN_ID,
    start_month: startMonth,
    start_day: startDay,
    end_month: endMonth,
    end_day: endDay,
    timezone: TZ,
    is_active: isActive,
  };
}

function weekdayRule({ weekday = 3, start = '09:00', end = '12:00' } = {}) {
  return {
    id: `rule-${weekday}-${start}`,
    guide_id: GUIDE_ID,
    activity_plan_id: PLAN_ID,
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

function selectedSchedule(overrides = {}) {
  return {
    id: 'schedule-1067-close-gate',
    activity_id: ACTIVITY_ID,
    plan_id: PLAN_ID,
    start_at: REQUEST_START,
    end_at: REQUEST_END,
    capacity: 8,
    booked_count: 0,
    status: 'open',
    ...overrides,
  };
}

function conflictOverride(overrides = {}) {
  return {
    id: 'override-1067-close-gate',
    guide_id: GUIDE_ID,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    start_at: REQUEST_START,
    end_at: REQUEST_END,
    reason: 'manual reopen',
    requires_helper: false,
    helper_status: 'not_required',
    status: 'active',
    created_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    guideId: GUIDE_ID,
    activityId: ACTIVITY_ID,
    planId: PLAN_ID,
    timezone: TZ,
    participants: 2,
    dateFrom: '2026-07-01',
    dateTo: '2026-07-01',
    requestedStartAt: REQUEST_START,
    minParticipants: 1,
    rules: [weekdayRule()],
    blackouts: [],
    bookings: [],
    plan: {
      id: PLAN_ID,
      activity_id: ACTIVITY_ID,
      duration_minutes: 180,
      max_participants: 8,
      booking_type: 'scheduled',
      is_year_round: false,
    },
    seasons: [],
    planStatus: 'active',
    ...overrides,
  };
}

test('GH-1067 / #1239: available-slots selectedSchedule with no_active_season is fail-OPEN (was fail-closed pre-#1239)', () => {
  for (const authority of ['authoritative', 'fallback']) {
    // #1239: empty seasons → 全部開放. The booking evaluator must NOT reject
    // an authoritative / fallback selectedSchedule with `outside_season`
    // just because no season rows exist. Explicit out-of-range seasons
    // still close the gate — covered by the sibling test below.
    const noActiveSeason = evaluateBookingAvailability({
      ...baseInput(),
      selectedSchedule: selectedSchedule(),
      selectedScheduleAuthority: authority,
    });

    assert.equal(noActiveSeason.available, true, `${authority} selectedSchedule with empty seasons must be available per #1239`);
    assert.notEqual(noActiveSeason.reasonCode, 'outside_season');
  }
});

test('GH-1067: available-slots selectedSchedule stays fail-closed for explicit outside_season', () => {
  for (const authority of ['authoritative', 'fallback']) {
    // Active season for Q1; request is in July → still rejected. This is
    // the "explicit active season window restricts outside dates" guarantee
    // #1239 deliberately preserves.
    const outsideSeason = evaluateBookingAvailability({
      ...baseInput({
        seasons: [season({ startMonth: 1, startDay: 1, endMonth: 3, endDay: 31 })],
      }),
      selectedSchedule: selectedSchedule(),
      selectedScheduleAuthority: authority,
    });

    assert.equal(outsideSeason.available, false, `${authority} selectedSchedule must not reopen outside-season dates`);
    assert.equal(outsideSeason.reasonCode, 'outside_season');
    assert.equal(outsideSeason.slots.length, 0);
  }
});

test('GH-1067 / #1239: booking draft close gate accepts selected schedule with no_active_season (fail-open)', () => {
  for (const authority of ['authoritative', 'fallback']) {
    const noActiveSeason = evaluateEffectiveBookingAvailability({
      ...baseInput(),
      selectedSchedule: selectedSchedule(),
      selectedScheduleAuthority: authority,
    });

    // Per #1239 the season gate stops contributing to the rejection when
    // no rows exist. The draft path may still reject for orthogonal
    // reasons (missing-from-generated-slots etc.) — what we lock down
    // here is that it is NOT `outside_season`.
    assert.notEqual(noActiveSeason.reasonCode, 'outside_season', `${authority} draft path must not flag no_active_season as outside_season`);
    assert.notEqual(noActiveSeason.canonicalState, 'outside_season');
  }
});

test('GH-1067: booking draft close gate still rejects authoritative/fallback selected schedules on explicit outside-season dates', () => {
  for (const authority of ['authoritative', 'fallback']) {
    const outsideSeason = evaluateEffectiveBookingAvailability({
      ...baseInput({
        seasons: [season({ startMonth: 1, startDay: 1, endMonth: 3, endDay: 31 })],
      }),
      selectedSchedule: selectedSchedule(),
      selectedScheduleAuthority: authority,
    });

    assert.equal(outsideSeason.available, false, `${authority} draft path must reject outside-season dates`);
    assert.equal(outsideSeason.reasonCode, 'outside_season');
    assert.equal(outsideSeason.canonicalState, 'outside_season');
  }
});

test('GH-1067 RED: explicit year-round keeps traveler close gate open when no other blocker exists', () => {
  for (const authority of ['authoritative', 'fallback']) {
    const availableSlots = evaluateBookingAvailability({
      ...baseInput({
        plan: {
          ...baseInput().plan,
          is_year_round: true,
        },
      }),
      selectedSchedule: selectedSchedule(),
      selectedScheduleAuthority: authority,
    });

    assert.equal(availableSlots.available, true);
    assert.equal(availableSlots.slots.length, 1);

    const draft = evaluateEffectiveBookingAvailability({
      ...baseInput({
        plan: {
          ...baseInput().plan,
          is_year_round: true,
        },
      }),
      selectedSchedule: selectedSchedule(),
      selectedScheduleAuthority: authority,
    });

    assert.equal(draft.available, true);
    assert.equal(draft.matchedSlot?.startAt, REQUEST_START);
  }
});

test('GH-1067: conflict override cannot unlock explicit outside_season selected schedules', () => {
  // #1239 only changes the empty-seasons case to fail-open. Explicit
  // out-of-range seasons still close the gate hard, and a conflict
  // override does not give an admin a back door to that — the seasonal
  // restriction is a product-level guardrail, not a per-booking conflict.
  for (const authority of ['authoritative', 'fallback']) {
    const outsideSeasonDraft = evaluateEffectiveBookingAvailability({
      ...baseInput({
        seasons: [season({ startMonth: 1, startDay: 1, endMonth: 3, endDay: 31 })],
        bookings: [
          {
            id: 'booking-conflict',
            guide_id: GUIDE_ID,
            activity_id: ACTIVITY_ID,
            activity_plan_id: PLAN_ID,
            start_at: REQUEST_START,
            end_at: '2026-07-01T17:00:00+08:00',
            status: 'confirmed',
            participants: 2,
          },
        ],
        conflictOverrides: [conflictOverride()],
      }),
      selectedSchedule: selectedSchedule(),
      selectedScheduleAuthority: authority,
    });

    assert.equal(outsideSeasonDraft.available, false);
    assert.equal(outsideSeasonDraft.reasonCode, 'outside_season');
    assert.equal(outsideSeasonDraft.canonicalState, 'outside_season');
  }
});
