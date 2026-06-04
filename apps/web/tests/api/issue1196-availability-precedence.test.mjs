/**
 * Issue #1196 — Clarify unified availability field precedence across admin, guide, traveler
 *
 * AC1: canonical precedence — plan status outranks rule/conflict checks
 * AC3: admin override tier — conflict override yields allowed_with_admin_override + metadata.overrideId
 *
 * Precedence chain (highest → lowest):
 *   plan status (inactive_plan)
 *   > season gate (outside_season)
 *   > no rules (outside_rule)
 *   > blackout (blackout)
 *   > booking conflict + override → allowed_with_admin_override | blocked_by_conflict
 *   > slot available → available | full | closed
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCanonicalAvailabilityState } from '../../src/lib/availability-v2/effective-availability-resolver.ts';

const TZ = 'Asia/Taipei';

// ── Shared fixture helpers ───────────────────────────────────────────────────

function weekdayRule({ weekday = 5, start = '09:00', end = '12:00' } = {}) {
  return {
    id: `r-${weekday}-${start}`,
    guide_id: 'g-1196',
    activity_plan_id: 'p-1196',
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

function season({ startMonth = 1, startDay = 1, endMonth = 12, endDay = 31, isActive = true } = {}) {
  return {
    id: `season-${startMonth}-${startDay}-${endMonth}-${endDay}`,
    activity_plan_id: 'p-1196',
    start_month: startMonth,
    start_day: startDay,
    end_month: endMonth,
    end_day: endDay,
    timezone: TZ,
    is_active: isActive,
  };
}

function conflictOverride({ id = 'ov-1', startAt, endAt } = {}) {
  return {
    id,
    guide_id: 'g-1196',
    activity_id: 'a-1196',
    activity_plan_id: 'p-1196',
    start_at: startAt,
    end_at: endAt,
    reason: '管理員允許',
    requires_helper: false,
    helper_status: 'not_needed',
    status: 'active',
    created_at: null,
    created_by_admin_email: 'admin@midao.tw',
  };
}

// ── AC1: plan status outranks everything ─────────────────────────────────────

test('GH-1196 AC1: inactive_plan outranks booking conflict when planStatus=inactive', () => {
  // GIVEN: planStatus='inactive', a booking conflict exists, slot is outside any rule
  const result = resolveCanonicalAvailabilityState({
    guideId: 'g-1196',
    activityId: 'a-1196',
    planId: 'p-1196',
    requestedStartAt: '2026-04-10T09:00:00+08:00',
    requestedEndAt: '2026-04-10T12:00:00+08:00',
    timezone: TZ,
    // No rules → would be outside_rule if plan were active
    rules: [],
    blackouts: [],
    bookings: [
      {
        id: 'b-conflict',
        guide_id: 'g-1196',
        start_at: '2026-04-10T09:00:00+08:00',
        end_at: '2026-04-10T12:00:00+08:00',
        status: 'confirmed',
      },
    ],
    seasons: [season()],
    seasonGateEnabled: false,
    planStatus: 'inactive',
    slotAvailable: false,
    slotUnavailableReason: 'BOOKING_CONFLICT',
    capacityAvailable: true,
  });

  // THEN: plan status wins — returns inactive_plan, not blocked_by_conflict or outside_rule
  assert.equal(result.state, 'inactive_plan');
});

test('GH-1196 AC1: inactive_plan outranks outside_season when planStatus=inactive and seasonGateEnabled', () => {
  // GIVEN: planStatus='inactive' AND season gate would block the slot
  const result = resolveCanonicalAvailabilityState({
    requestedStartAt: '2026-07-10T09:00:00+08:00',
    timezone: TZ,
    rules: [weekdayRule()],
    blackouts: [],
    bookings: [],
    // Season only covers Nov–Apr; July is outside
    seasons: [season({ startMonth: 11, startDay: 1, endMonth: 4, endDay: 30 })],
    seasonGateEnabled: true,
    planStatus: 'inactive',
    slotAvailable: true,
    capacityAvailable: true,
  });

  assert.equal(result.state, 'inactive_plan');
});

test('GH-1196 AC1: inactive_plan outranks outside_rule when planStatus=inactive and no rules', () => {
  // GIVEN: planStatus='inactive', no rules at all
  const result = resolveCanonicalAvailabilityState({
    requestedStartAt: '2026-04-10T09:00:00+08:00',
    timezone: TZ,
    rules: [],
    blackouts: [],
    bookings: [],
    seasons: [],
    seasonGateEnabled: false,
    planStatus: 'inactive',
    slotAvailable: false,
    capacityAvailable: true,
  });

  assert.equal(result.state, 'inactive_plan');
});

test('GH-1196 AC1: active plan with booking conflict yields blocked_by_conflict (not inactive_plan)', () => {
  // Control test — ensure inactive_plan is NOT returned when plan is active
  const result = resolveCanonicalAvailabilityState({
    guideId: 'g-1196',
    activityId: 'a-1196',
    planId: 'p-1196',
    requestedStartAt: '2026-04-10T09:00:00+08:00',
    requestedEndAt: '2026-04-10T12:00:00+08:00',
    timezone: TZ,
    rules: [weekdayRule()],
    blackouts: [],
    bookings: [
      {
        id: 'b-conflict',
        guide_id: 'g-1196',
        start_at: '2026-04-10T09:00:00+08:00',
        end_at: '2026-04-10T12:00:00+08:00',
        status: 'confirmed',
      },
    ],
    seasons: [season()],
    seasonGateEnabled: false,
    planStatus: 'active',
    slotAvailable: false,
    slotUnavailableReason: 'BOOKING_CONFLICT',
    capacityAvailable: true,
  });

  assert.equal(result.state, 'blocked_by_conflict');
});

// ── AC3: admin override tier ─────────────────────────────────────────────────

test('GH-1196 AC3: booking conflict with matching active override yields allowed_with_admin_override', () => {
  // GIVEN: a booking conflict exists AND there is a matching guide_slot conflict override
  const requestedStartAt = '2026-04-10T09:00:00+08:00';
  const requestedEndAt = '2026-04-10T12:00:00+08:00';

  const result = resolveCanonicalAvailabilityState({
    guideId: 'g-1196',
    activityId: 'a-1196',
    planId: 'p-1196',
    requestedStartAt,
    requestedEndAt,
    timezone: TZ,
    rules: [weekdayRule()],
    blackouts: [],
    bookings: [
      {
        id: 'b-conflict',
        guide_id: 'g-1196',
        start_at: requestedStartAt,
        end_at: requestedEndAt,
        status: 'confirmed',
      },
    ],
    seasons: [season()],
    seasonGateEnabled: false,
    planStatus: 'active',
    slotAvailable: false,
    slotUnavailableReason: 'BOOKING_CONFLICT',
    capacityAvailable: true,
    conflictOverrides: [conflictOverride({ id: 'ov-abc', startAt: requestedStartAt, endAt: requestedEndAt })],
  });

  // THEN: state is allowed_with_admin_override AND metadata.overrideId is set
  assert.equal(result.state, 'allowed_with_admin_override');
  assert.ok(result.metadata, 'metadata must be present');
  assert.equal(result.metadata.overrideId, 'ov-abc');
});

test('GH-1196 AC3: booking conflict without matching override yields blocked_by_conflict', () => {
  // Control: no override → still blocked
  const requestedStartAt = '2026-04-10T09:00:00+08:00';
  const requestedEndAt = '2026-04-10T12:00:00+08:00';

  const result = resolveCanonicalAvailabilityState({
    guideId: 'g-1196',
    activityId: 'a-1196',
    planId: 'p-1196',
    requestedStartAt,
    requestedEndAt,
    timezone: TZ,
    rules: [weekdayRule()],
    blackouts: [],
    bookings: [
      {
        id: 'b-conflict',
        guide_id: 'g-1196',
        start_at: requestedStartAt,
        end_at: requestedEndAt,
        status: 'confirmed',
      },
    ],
    seasons: [season()],
    seasonGateEnabled: false,
    planStatus: 'active',
    slotAvailable: false,
    slotUnavailableReason: 'BOOKING_CONFLICT',
    capacityAvailable: true,
    conflictOverrides: [],
  });

  assert.equal(result.state, 'blocked_by_conflict');
  assert.equal(result.metadata, undefined);
});

test('GH-1196 AC3: disabled override does not promote conflict to allowed_with_admin_override', () => {
  const requestedStartAt = '2026-04-10T09:00:00+08:00';
  const requestedEndAt = '2026-04-10T12:00:00+08:00';

  const disabledOverride = {
    ...conflictOverride({ id: 'ov-disabled', startAt: requestedStartAt, endAt: requestedEndAt }),
    status: 'disabled',
  };

  const result = resolveCanonicalAvailabilityState({
    guideId: 'g-1196',
    activityId: 'a-1196',
    planId: 'p-1196',
    requestedStartAt,
    requestedEndAt,
    timezone: TZ,
    rules: [weekdayRule()],
    blackouts: [],
    bookings: [
      {
        id: 'b-conflict',
        guide_id: 'g-1196',
        start_at: requestedStartAt,
        end_at: requestedEndAt,
        status: 'confirmed',
      },
    ],
    seasons: [season()],
    seasonGateEnabled: false,
    planStatus: 'active',
    slotAvailable: false,
    slotUnavailableReason: 'BOOKING_CONFLICT',
    capacityAvailable: true,
    conflictOverrides: [disabledOverride],
  });

  assert.equal(result.state, 'blocked_by_conflict');
});
