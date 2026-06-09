/**
 * TDD tests for GH-1304: Separate re-emit anchor from conflict-blocker
 *
 * Root cause: evaluateBookingAvailability was passing nonGroupConflictBookings
 * (which excludes same-plan bookings) as the only bookings to generateAvailableSlots.
 *
 * This caused re-emit anchors to disappear when a booking from the SAME activity plan
 * (same-plan group booking) existed.
 *
 * Fix: Add reemitAnchorBookings?: ExistingBooking[] to SlotGeneratorDeps,
 * so buildCandidateSlotsForRule receives full bookings (re-emit anchors)
 * while filterConflicts continues using nonGroupConflictBookings (conflict blocker).
 *
 * GH-1316 addendum: cover the actual #1304 acceptance scenarios (group add-on):
 *   - same-plan booking within max → 09:00 slot is still available for new joiners,
 *   - same-plan booking at max → 09:00 (and all slots) blocked by CAPACITY_EXCEEDED,
 *   - different-plan booking → 09:00 IS blocked (conflict-blocker still applies).
 * The original it#2 below was misleading: its title said "does NOT block availability"
 * but its assertion only checked 10:30 (a #1290 re-emit concern) and the inline
 * comment claimed 09:00 "should not appear as available" — the opposite of #1304's
 * group add-on goal. Re-stated below as `same-plan booking does NOT block 09:00`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Import from evaluator (the actual fix location)
import { evaluateBookingAvailability } from '../../src/lib/availability-v2/booking-availability-evaluator.ts';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const PLAN = {
  id: 'plan-1',
  activity_id: 'activity-1',
  duration_minutes: 60,
  max_participants: 4,
  booking_type: 'scheduled',
};

const ACTIVITY = {
  id: 'activity-1',
  name_en: 'Test Activity',
  name_zh: '測試活動',
};

const RULE = {
  id: 'rule-1',
  guide_id: 'guide-1',
  activity_plan_id: PLAN.id, // Scoped to this plan
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
  use_dynamic_reemit: true, // ON: re-emit after booking + buffer
};

// Monday 2025-01-06 UTC
const DATE_STR = '2025-01-06';

// Same-plan group booking: occupies 09:00-10:00, same activity_plan_id
// Without fix: this booking would be filtered out of re-emit anchors,
// causing 10:30 to disappear.
const SAME_PLAN_BOOKING = {
  id: 'same-plan-booking-1',
  guide_id: 'guide-1',
  start_at: '2025-01-06T09:00:00.000Z',
  end_at: '2025-01-06T10:00:00.000Z',
  status: 'confirmed',
  participants: 2,
  activity_id: ACTIVITY.id,
  activity_plan_id: PLAN.id, // SAME PLAN
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
};

// ---------------------------------------------------------------------------
// 1. Same-plan booking must be included in re-emit anchor calculation
// ---------------------------------------------------------------------------

describe('GH-1304: re-emit anchor vs conflict-blocker split', () => {
  it('same-plan booking IS used as re-emit anchor (full bookings)', () => {
    // Traveler calls evaluateBookingAvailability
    // Input includes same-plan booking
    const result = evaluateBookingAvailability({
      guideId: 'guide-1',
      activityId: ACTIVITY.id,
      planId: PLAN.id,
      rules: [RULE],
      blackouts: [],
      bookings: [SAME_PLAN_BOOKING], // Full bookings array
      plan: PLAN,
      dateFrom: DATE_STR,
      dateTo: DATE_STR,
      timezone: 'UTC',
      participants: 1,
    });

    // Expected slots for Mon 09:00-12:00 with 60-min interval:
    // - 09:00-10:00 (blocked by SAME_PLAN_BOOKING, no conflict override, so unavailable)
    // - 10:30-11:30 (re-emit anchor: booking_end=10:00 + buffer=30min)
    // - 11:30-12:00 (too short for 60-min plan)
    //
    // Without fix: SAME_PLAN_BOOKING filtered out of reemitAnchorBookings,
    // so 10:30 candidate not generated → must be 0 or 2 slots
    // With fix: 10:30 is generated → 2 slots (10:30, 11:00 both appear, but 11:00 is too short)
    //
    // Actually: 10:30-11:30 (60 min, fits) = 1 slot if no conflict

    const slotStarts = result.slots.map((s) => s.startAt.slice(0, 16));

    assert.ok(
      slotStarts.some((s) => s.includes('T10:30')),
      `must include 10:30 re-emit slot; got starts: ${slotStarts.join(', ')}`
    );
  });

  it('same-plan booking within max → 09:00 stays AVAILABLE for new joiners (group add-on)', () => {
    // GH-1304 acceptance core: the same-plan booking (2 people, plan max=4)
    // must NOT block the 09:00 slot — a new traveler asking for 1 seat brings
    // the total to 3, still within max. This is exactly what
    // excludeSameActivityPlanDateRangeBookings is for.
    const result = evaluateBookingAvailability({
      guideId: 'guide-1',
      activityId: ACTIVITY.id,
      planId: PLAN.id,
      rules: [RULE],
      blackouts: [],
      bookings: [SAME_PLAN_BOOKING], // 2 participants
      plan: PLAN,
      dateFrom: DATE_STR,
      dateTo: DATE_STR,
      timezone: 'UTC',
      participants: 1, // 2 + 1 = 3, still within max=4
    });

    assert.strictEqual(result.available, true, 'group add-on within max must yield available=true');
    const slot09 = result.slots.find((s) => s.startAt.slice(11, 16) === '09:00');
    assert.ok(slot09, `09:00 slot must exist even when a same-plan booking sits on it; got: ${result.slots.map((s) => s.startAt).join(', ')}`);
    assert.strictEqual(slot09.isAvailable, true, '09:00 slot must be marked isAvailable for group add-on');
    // serializeSlots reports capacityLeft = max_participants - requested; that
    // value can vary as the API evolves, but it must always have headroom (>0)
    // when a new joiner can fit within the group ceiling.
    assert.ok(slot09.capacityLeft >= 1, `09:00 capacityLeft must be >=1 (got ${slot09.capacityLeft})`);
  });

  it('same-plan booking at capacity → all slots blocked by CAPACITY_EXCEEDED', () => {
    // GH-1304 acceptance #2: when the same-plan booking already fills the
    // group (4/4), a new request must be rejected — not because of conflict
    // blocking, but because the capacity rule fails.
    const FULL_SAME_PLAN = { ...SAME_PLAN_BOOKING, id: 'same-plan-full', participants: 4 };
    const result = evaluateBookingAvailability({
      guideId: 'guide-1',
      activityId: ACTIVITY.id,
      planId: PLAN.id,
      rules: [RULE],
      blackouts: [],
      bookings: [FULL_SAME_PLAN],
      plan: PLAN,
      dateFrom: DATE_STR,
      dateTo: DATE_STR,
      timezone: 'UTC',
      participants: 1,
    });

    assert.strictEqual(result.available, false, 'capacity-full day must yield available=false');
    assert.strictEqual(result.reasonCode, 'CAPACITY_EXCEEDED', `expected CAPACITY_EXCEEDED reason; got ${result.reasonCode}`);
    assert.strictEqual(result.slots.length, 0, 'no slot should survive when capacity is full');
  });

  it('different-plan booking still blocks 09:00 (conflict-blocker only excludes same-plan)', () => {
    // GH-1304 acceptance #3: the conflict-blocker exclusion is scoped to
    // SAME activity_plan_id. A different plan's booking at 09:00-10:00 must
    // still block 09:00 for a traveler picking THIS plan — group add-on is
    // a per-plan concept, not a cross-plan one.
    const DIFF_PLAN_BOOKING = { ...SAME_PLAN_BOOKING, id: 'diff-plan-1', activity_plan_id: 'other-plan' };
    const result = evaluateBookingAvailability({
      guideId: 'guide-1',
      activityId: ACTIVITY.id,
      planId: PLAN.id,
      rules: [RULE],
      blackouts: [],
      bookings: [DIFF_PLAN_BOOKING],
      plan: PLAN,
      dateFrom: DATE_STR,
      dateTo: DATE_STR,
      timezone: 'UTC',
      participants: 1,
    });

    const slot09 = result.slots.find((s) => s.startAt.slice(11, 16) === '09:00');
    assert.strictEqual(slot09, undefined, `09:00 must be filtered out by the cross-plan conflict; got: ${result.slots.map((s) => s.startAt).join(', ')}`);
    // 10:30 re-emit anchor must still fire (different plan booking is still a
    // valid anchor when use_dynamic_reemit is on).
    assert.ok(
      result.slots.some((s) => s.startAt.slice(11, 16) === '10:30'),
      '10:30 re-emit must still emit from cross-plan anchor',
    );
  });

  it('re-emit slot 10:30 capacity calculation follows re-emit anchor logic', () => {
    const result = evaluateBookingAvailability({
      guideId: 'guide-1',
      activityId: ACTIVITY.id,
      planId: PLAN.id,
      rules: [RULE],
      blackouts: [],
      bookings: [SAME_PLAN_BOOKING], // 2 participants, max 4
      plan: PLAN,
      dateFrom: DATE_STR,
      dateTo: DATE_STR,
      timezone: 'UTC',
      participants: 1,
    });

    const reemitSlot = result.slots.find((s) => s.startAt.slice(11, 16) === '10:30');
    assert.ok(reemitSlot, 'must have 10:30 slot');

    // The capacity calculation uses the same-plan booking to reduce capacity.
    // Since the booking (2 participants) overlaps with the re-emit time calculation,
    // capacity may be reduced. The important thing is that 10:30 exists and is available.
    assert.ok(reemitSlot.capacityLeft > 0, 'capacity at 10:30 should be available');
  });
});
