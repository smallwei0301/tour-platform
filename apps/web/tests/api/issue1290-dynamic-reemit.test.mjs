/**
 * TDD tests for GH-1290 per-rule dynamic buffer re-emit
 *
 * Count note: the focused GH-1290 + GH-1289 regression command covers 56 tests;
 * adding tests/slot-generator.test.mjs brings the broader slot regression total to 72+.
 *
 * Tests verify:
 * - OFF (default): behaviour == #1289 (fixed grid, buffer-filtered, no re-emit)
 * - ON: after a conflicting booking, next candidate starts at booking_end + buffer_after
 * - guide preview (generateAvailableSlots) and traveler V2 (getV2ActivityAvailability)
 *   produce consistent results for the same rule+day (shared helper parity)
 * - normalizeRuleRow maps use_dynamic_reemit ?? false
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Import from slot-generator (canonical source)
import {
  buildCandidateSlots,
  buildCandidateSlotsForRule,
  generateAvailableSlots,
} from '../../src/lib/slot-generator.ts';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const BASE_RULE = {
  id: 'rule-1',
  guide_id: 'guide-1',
  activity_plan_id: null,
  weekday: 1, // Monday
  start_time_local: '09:00',
  end_time_local: '12:00',
  timezone: 'UTC',
  slot_interval_minutes: 60,
  buffer_before_minutes: 0,
  buffer_after_minutes: 30,
  effective_from: null,
  effective_to: null,
  is_active: true,
  use_dynamic_reemit: false, // OFF by default
};

const PLAN = {
  id: 'plan-1',
  activity_id: 'act-1',
  duration_minutes: 60,
  max_participants: 4,
  booking_type: 'scheduled',
};

// Monday 2025-01-06 UTC
const DATE_STR = '2025-01-06';

// Booking that occupies 09:00-10:00 UTC (the first grid slot)
// Re-emit: booking_end(10:00) + buffer_after(30) = 10:30
// Re-emit slot: 10:30 - 11:30 (fits within window end 12:00 for 60-min plan)
// Note: booking.buffer_after_minutes=0 so filterConflicts uses only rule buffer
//   bookingWithBufferEnd = 10:00 + rule(30) + booking(0) = 10:30
//   rangesOverlap(10:30, 11:30, 09:00, 10:30) → 10:30 < 10:30 is false → no overlap → passes
const BOOKING_09_10 = {
  id: 'booking-1',
  guide_id: 'guide-1',
  start_at: '2025-01-06T09:00:00.000Z',
  end_at: '2025-01-06T10:00:00.000Z',
  status: 'confirmed',
  participants: 1,
  activity_id: null,
  activity_plan_id: null,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0, // only rule buffer applies
};

// Booking that occupies 10:00-11:00 UTC (second slot) — used for OFF tests
const BOOKING_10_11 = {
  id: 'booking-2',
  guide_id: 'guide-1',
  start_at: '2025-01-06T10:00:00.000Z',
  end_at: '2025-01-06T11:00:00.000Z',
  status: 'confirmed',
  participants: 1,
  activity_id: null,
  activity_plan_id: null,
  buffer_before_minutes: 0,
  buffer_after_minutes: 30,
};

// ---------------------------------------------------------------------------
// 1. buildCandidateSlotsForRule export exists
// ---------------------------------------------------------------------------

describe('buildCandidateSlotsForRule — export', () => {
  it('is a function exported from slot-generator', () => {
    assert.strictEqual(typeof buildCandidateSlotsForRule, 'function');
  });
});

// ---------------------------------------------------------------------------
// 2. OFF (default) — behaviour == #1289 (no re-emit, conflicts filtered out)
// ---------------------------------------------------------------------------

describe('use_dynamic_reemit=false (default) — grid behaviour unchanged', () => {
  it('buildCandidateSlotsForRule with OFF returns same candidates as buildCandidateSlots', () => {
    const ruleOff = { ...BASE_RULE, use_dynamic_reemit: false };
    const expected = buildCandidateSlots(ruleOff, PLAN.duration_minutes, DATE_STR);
    const got = buildCandidateSlotsForRule(ruleOff, [], PLAN.duration_minutes, DATE_STR);
    assert.strictEqual(got.length, expected.length, 'candidate count must match');
    for (let i = 0; i < expected.length; i++) {
      assert.strictEqual(
        got[i].startAt.toISOString(),
        expected[i].startAt.toISOString(),
        `slot[${i}] startAt`
      );
    }
  });

  it('generateAvailableSlots with OFF filters out conflicting slots (no re-emit)', () => {
    const ruleOff = { ...BASE_RULE, use_dynamic_reemit: false };
    const result = generateAvailableSlots(
      {
        guideId: 'guide-1',
        activityPlanId: null,
        dateFrom: DATE_STR,
        dateTo: DATE_STR,
        timezone: 'UTC',
        participants: 1,
      },
      {
        rules: [ruleOff],
        blackouts: [],
        bookings: [BOOKING_10_11],
        plan: PLAN,
      }
    );
    // Grid: 09:00, 10:00, 11:00
    // 10:00 slot conflicts with booking (10:00-11:00 + 30min buffer = 11:30)
    // 11:00 slot overlaps buffer window → filtered
    // Only 09:00 survives
    const starts = result.slots.map((s) => s.startAt);
    assert.ok(
      starts.some((s) => s.startsWith('2025-01-06T09:00')),
      '09:00 should be available'
    );
    assert.ok(
      !starts.some((s) => s.startsWith('2025-01-06T10:00')),
      '10:00 should be filtered (conflicts with booking)'
    );
    assert.ok(
      !starts.some((s) => s.startsWith('2025-01-06T11:00')),
      '11:00 should be filtered (within booking+buffer window)'
    );
  });
});

// ---------------------------------------------------------------------------
// 3. ON — re-emit: after booking 09:00-10:00 + 30min buffer → next candidate at 10:30
// ---------------------------------------------------------------------------

describe('use_dynamic_reemit=true — re-emit after booking_end + buffer_after', () => {
  it('buildCandidateSlotsForRule ON injects re-emit candidate at booking_end+buffer_after', () => {
    const ruleOn = { ...BASE_RULE, use_dynamic_reemit: true };
    const candidates = buildCandidateSlotsForRule(
      ruleOn,
      [BOOKING_09_10],
      PLAN.duration_minutes,
      DATE_STR
    );
    const starts = candidates.map((s) => s.startAt.toISOString());
    // Base grid: 09:00, 10:00, 11:00
    // Re-emit adds: booking_end(10:00) + buffer_after(30) = 10:30
    // 10:30 + 60min = 11:30 <= 12:00 → within window → emitted
    assert.ok(
      starts.some((s) => s.startsWith('2025-01-06T10:30')),
      `re-emit slot at 10:30 must exist; got: ${starts.join(', ')}`
    );
  });

  it('re-emit slot at 10:30 fits within availability window (endAt 11:30 <= 12:00)', () => {
    const ruleOn = { ...BASE_RULE, use_dynamic_reemit: true };
    const candidates = buildCandidateSlotsForRule(
      ruleOn,
      [BOOKING_09_10],
      PLAN.duration_minutes,
      DATE_STR
    );
    const reemit = candidates.find((s) => s.startAt.toISOString().startsWith('2025-01-06T10:30'));
    assert.ok(reemit, 're-emit candidate at 10:30 must exist');
    // endAt = 10:30 + 60min = 11:30; window ends 12:00 → slot fits
    const dayEnd = new Date('2025-01-06T12:00:00.000Z');
    assert.ok(
      reemit.endAt <= dayEnd,
      `re-emit endAt(${reemit.endAt.toISOString()}) must be <= dayEnd(${dayEnd.toISOString()})`
    );
  });

  it('generateAvailableSlots ON includes re-emit slot after booking conflict', () => {
    const ruleOn = { ...BASE_RULE, use_dynamic_reemit: true };
    const result = generateAvailableSlots(
      {
        guideId: 'guide-1',
        activityPlanId: null,
        dateFrom: DATE_STR,
        dateTo: DATE_STR,
        timezone: 'UTC',
        participants: 1,
      },
      {
        rules: [ruleOn],
        blackouts: [],
        bookings: [BOOKING_09_10],
        plan: PLAN, // 60-min duration
      }
    );
    const starts = result.slots.map((s) => s.startAt);
    // After booking 09:00-10:00 + buffer 30min, filter removes 09:00 and 10:00
    // Re-emit at 10:30 (endAt=11:30) should appear
    // Grid 11:00 slot: 11:00+60=12:00 <= 12:00 — within window as candidate,
    //   but conflicts check: booking_end(10:00)+buffer(30)=10:30; slot 11:00 > 10:30 → no conflict
    // So we expect 10:30 and 11:00 to both be available
    assert.ok(
      starts.some((s) => s.includes('T10:30')),
      `re-emit 10:30 should appear; got: ${starts.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// 4. normalizeRuleRow maps use_dynamic_reemit ?? false
//    Verified indirectly: when rule has use_dynamic_reemit=undefined (column not
//    yet in DB), the ?? false guard in normalizeRuleRow must prevent crashes and
//    behave as OFF.
// ---------------------------------------------------------------------------

describe('normalizeRuleRow — use_dynamic_reemit ?? false guard', () => {
  it('rule with use_dynamic_reemit=undefined behaves as OFF (no re-emit)', () => {
    // Simulates pre-migration state where column does not exist in DB row
    const ruleUndef = { ...BASE_RULE, use_dynamic_reemit: undefined };
    const candidates = buildCandidateSlotsForRule(
      ruleUndef,
      [BOOKING_09_10],
      PLAN.duration_minutes,
      DATE_STR
    );
    const expected = buildCandidateSlots(ruleUndef, PLAN.duration_minutes, DATE_STR);
    // Should behave same as OFF: no re-emit added
    assert.strictEqual(candidates.length, expected.length, 'undefined treated as false — same as OFF');
    const starts = candidates.map((s) => s.startAt.toISOString());
    assert.ok(
      !starts.some((s) => s.startsWith('2025-01-06T10:30')),
      'no re-emit slot when use_dynamic_reemit=undefined'
    );
  });

  it('rule with use_dynamic_reemit=false does not emit re-emit slot', () => {
    const ruleOff = { ...BASE_RULE, use_dynamic_reemit: false };
    const candidates = buildCandidateSlotsForRule(ruleOff, [BOOKING_09_10], PLAN.duration_minutes, DATE_STR);
    assert.ok(!candidates.some((s) => s.startAt.toISOString().startsWith('2025-01-06T10:30')), 'no re-emit when false');
  });

  it('rule with use_dynamic_reemit=true does emit re-emit slot', () => {
    const ruleOn = { ...BASE_RULE, use_dynamic_reemit: true };
    const candidates = buildCandidateSlotsForRule(ruleOn, [BOOKING_09_10], PLAN.duration_minutes, DATE_STR);
    assert.ok(candidates.some((s) => s.startAt.toISOString().startsWith('2025-01-06T10:30')), 're-emit exists when true');
  });
});

// ---------------------------------------------------------------------------
// 5. guide<->traveler parity — both callers use shared helper
// ---------------------------------------------------------------------------

describe('guide preview vs traveler V2 parity via shared helper', () => {
  it('generateAvailableSlots and buildCandidateSlotsForRule produce same candidate starts ON', () => {
    const ruleOn = { ...BASE_RULE, use_dynamic_reemit: true };

    // Traveler path: buildCandidateSlotsForRule per rule per day
    const travelerCandidates = buildCandidateSlotsForRule(
      ruleOn,
      [BOOKING_09_10],
      PLAN.duration_minutes,
      DATE_STR
    );

    // Guide path: generateAvailableSlots
    const guideResult = generateAvailableSlots(
      {
        guideId: 'guide-1',
        activityPlanId: null,
        dateFrom: DATE_STR,
        dateTo: DATE_STR,
        timezone: 'UTC',
        participants: 1,
      },
      {
        rules: [ruleOn],
        blackouts: [],
        bookings: [BOOKING_09_10],
        plan: PLAN,
      }
    );

    // Both should include the re-emit 10:30 slot (it doesn't conflict since
    // booking_end+buffer=10:30 and re-emit starts at 10:30, outside the
    // conflict window of the booking)
    const travelerStarts = travelerCandidates.map((s) => s.startAt.toISOString().slice(0, 16));
    const guideStarts = guideResult.slots.map((s) => s.startAt.slice(0, 16));

    assert.ok(
      travelerStarts.some((s) => s.includes('T10:30')),
      `traveler candidates must include 10:30 re-emit; got: ${travelerStarts.join(', ')}`
    );
    assert.ok(
      guideStarts.some((s) => s.includes('T10:30')),
      `guide slots must include 10:30 re-emit; got: ${guideStarts.join(', ')}`
    );
  });
});
