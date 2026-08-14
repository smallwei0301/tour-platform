import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCanonicalAvailabilityRuleSelector,
  resolveCanonicalAvailabilityState,
} from '../../src/lib/availability-v2/effective-availability-resolver.ts';
import { generateAvailableSlots } from '../../src/lib/slot-generator.ts';

const GUIDE_ID = 'guide-1760';
const PLAN_ID = 'plan-1760';
const OTHER_PLAN_ID = 'plan-other-1760';
const TIMEZONE = 'Asia/Taipei';

function rule({
  id,
  activityPlanId = null,
  weekday,
  start = '09:00',
  end = '10:00',
  effectiveFrom = null,
  effectiveTo = null,
  isActive = true,
  guideId = GUIDE_ID,
} = {}) {
  return {
    id,
    guide_id: guideId,
    activity_plan_id: activityPlanId,
    weekday,
    start_time_local: start,
    end_time_local: end,
    timezone: TIMEZONE,
    slot_interval_minutes: 60,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    is_active: isActive,
  };
}

const GLOBAL_MON = rule({ id: 'global-mon', weekday: 1 });
const PLAN_TUE = rule({ id: 'plan-tue', activityPlanId: PLAN_ID, weekday: 2 });
const OTHER_PLAN_WED = rule({ id: 'other-plan-wed', activityPlanId: OTHER_PLAN_ID, weekday: 3 });
const EXACT_WED = rule({
  id: 'exact-wed',
  weekday: 3,
  start: '13:00',
  end: '14:00',
  effectiveFrom: '2026-06-10',
  effectiveTo: '2026-06-10',
});
const INACTIVE_GLOBAL = rule({ id: 'inactive-global', weekday: 1, isActive: false });
const OTHER_GUIDE_GLOBAL = rule({ id: 'other-guide-global', weekday: 1, guideId: 'guide-other-1760' });

function selector(policy, dayRevisions = []) {
  return createCanonicalAvailabilityRuleSelector({
    guideId: GUIDE_ID,
    planId: PLAN_ID,
    policy,
    rules: [GLOBAL_MON, PLAN_TUE, OTHER_PLAN_WED, EXACT_WED, INACTIVE_GLOBAL, OTHER_GUIDE_GLOBAL],
    dayRevisions,
    timezone: TIMEZONE,
  });
}

function canonicalInput(overrides = {}) {
  return {
    guideId: GUIDE_ID,
    activityId: 'activity-1760',
    planId: PLAN_ID,
    requestedStartAt: '2026-06-08T09:00:00+08:00',
    requestedEndAt: '2026-06-08T10:00:00+08:00',
    timezone: TIMEZONE,
    rules: [GLOBAL_MON],
    blackouts: [],
    bookings: [],
    seasons: [],
    planStatus: 'active',
    slotAvailable: true,
    capacityAvailable: true,
    ...overrides,
  };
}

test('Issue #1760: inherit combines active global and matching plan rules only', () => {
  const selected = selector('inherit')('2026-06-08');

  assert.deepEqual(selected.map((item) => item.id), ['global-mon', 'plan-tue', 'exact-wed']);
});

test('Issue #1760: restrict excludes all global rules and non-matching plan rules', () => {
  const selected = selector('restrict')('2026-06-09');

  assert.deepEqual(selected.map((item) => item.id), ['plan-tue']);
});

test('Issue #1760: closed policy wins over recurring and exact-date rules', () => {
  assert.deepEqual(selector('closed')('2026-06-10'), []);
});

test('Issue #1760: a closed day revision is a tombstone over recurring rules', () => {
  const selected = selector('inherit', [
    { guide_id: GUIDE_ID, local_date: '2026-06-09', timezone: TIMEZONE, revision: 4, is_closed: true },
  ])('2026-06-09');

  assert.deepEqual(selected, []);
});

test('Issue #1760: an open day revision returns only global exact-date ranges', () => {
  const selected = selector('inherit', [
    { guide_id: GUIDE_ID, local_date: '2026-06-10', timezone: TIMEZONE, revision: 5, is_closed: false },
  ])('2026-06-10');

  assert.deepEqual(selected.map((item) => item.id), ['exact-wed']);
});

test('Issue #1760: timezone-mismatched revision is ignored and legacy exact dates remain ordinary rules', () => {
  const mismatched = selector('inherit', [
    { guide_id: GUIDE_ID, local_date: '2026-06-10', timezone: 'UTC', revision: 6, is_closed: true },
  ])('2026-06-10');
  const noRevision = selector('inherit')('2026-06-10');

  assert.deepEqual(mismatched.map((item) => item.id), ['global-mon', 'plan-tue', 'exact-wed']);
  assert.deepEqual(noRevision.map((item) => item.id), ['global-mon', 'plan-tue', 'exact-wed']);
});

test('Issue #1760: canonical resolver uses context rules for outside_rule without changing legacy no-context states', () => {
  const restricted = resolveCanonicalAvailabilityState(canonicalInput({
    rules: [GLOBAL_MON],
    ruleContext: {
      guideId: GUIDE_ID,
      planId: PLAN_ID,
      policy: 'restrict',
      rules: [GLOBAL_MON],
      dayRevisions: [],
      timezone: TIMEZONE,
    },
  }));
  assert.equal(restricted.state, 'outside_rule');

  const legacyCases = [
    [canonicalInput(), 'available'],
    [canonicalInput({ rules: [] }), 'outside_rule'],
    [canonicalInput({ slotAvailable: false, slotUnavailableReason: 'BLACKOUT_CONFLICT' }), 'blackout'],
    [canonicalInput({ slotAvailable: false, slotUnavailableReason: 'BOOKING_CONFLICT', bookings: [{ id: 'booking-1760', guide_id: GUIDE_ID, start_at: '2026-06-08T09:00:00+08:00', end_at: '2026-06-08T10:00:00+08:00', status: 'confirmed' }] }), 'blocked_by_conflict'],
    [canonicalInput({ slotAvailable: false, capacityAvailable: false }), 'full'],
    [canonicalInput({ slotAvailable: false, capacityAvailable: true }), 'closed'],
  ];

  for (const [params, expectedState] of legacyCases) {
    assert.equal(resolveCanonicalAvailabilityState(params).state, expectedState);
  }
});

test('Issue #1760: selector is opt-in and selects per-date recurring, tombstone, and exact-day generator rules', () => {
  const rules = [GLOBAL_MON, PLAN_TUE, EXACT_WED];
  const input = {
    guideId: GUIDE_ID,
    activityPlanId: PLAN_ID,
    dateFrom: '2026-06-08',
    dateTo: '2026-06-10',
    timezone: TIMEZONE,
    participants: 1,
  };
  const deps = {
    rules,
    blackouts: [],
    bookings: [],
    plan: {
      id: PLAN_ID,
      activity_id: 'activity-1760',
      duration_minutes: 60,
      max_participants: 4,
      booking_type: 'instant',
    },
  };

  const baseline = generateAvailableSlots(input, deps);
  const selected = generateAvailableSlots(input, {
    ...deps,
    ruleSelector: selector('inherit', [
      { guide_id: GUIDE_ID, local_date: '2026-06-09', timezone: TIMEZONE, revision: 7, is_closed: true },
      { guide_id: GUIDE_ID, local_date: '2026-06-10', timezone: TIMEZONE, revision: 8, is_closed: false },
    ]),
  });

  assert.equal(baseline.slots.length, 3, 'baseline keeps existing no-selector behavior');
  assert.deepEqual(
    selected.slots.map((slot) => [slot.startAt, slot.endAt]),
    [
      ['2026-06-08T09:00:00+08:00', '2026-06-08T10:00:00+08:00'],
      ['2026-06-10T13:00:00+08:00', '2026-06-10T14:00:00+08:00'],
    ],
  );
  assert.equal(selected.slots.every((slot) => slot.bookingType === 'instant' && slot.capacityLeft === 3), true);
});
