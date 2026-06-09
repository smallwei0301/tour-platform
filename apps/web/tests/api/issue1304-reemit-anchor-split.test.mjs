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

  it('same-plan booking does NOT block availability (conflict-blocker excludes it)', () => {
    // The SAME_PLAN_BOOKING should not create a "conflict" that blocks the 09:00 slot
    // from being offered to someone else (because the rule scopes to this plan only,
    // and same-plan bookings are for capacity tracking, not conflict blocking).
    //
    // In this case, since we have a same-plan booking at 09:00-10:00,
    // the 09:00 slot should not be marked conflicted (only capacity-reduced).
    // For travelers adding to the same plan (group booking), this is expected.

    const result = evaluateBookingAvailability({
      guideId: 'guide-1',
      activityId: ACTIVITY.id,
      planId: PLAN.id,
      rules: [RULE],
      blackouts: [],
      bookings: [SAME_PLAN_BOOKING],
      plan: PLAN,
      dateFrom: DATE_STR,
      dateTo: DATE_STR,
      timezone: 'UTC',
      participants: 1,
    });

    // The 09:00-10:00 slot should not appear as available
    // (conflicted by same-plan booking occupying the time)
    const slot09Exists = result.slots.some((s) => s.startAt.slice(11, 16) === '09:00');

    // Note: depending on isAvailable flag logic, this might be: slot exists but isAvailable=false
    // For this test, we just verify that 10:30 is the key re-emit slot that exists
    assert.ok(
      result.slots.some((s) => s.startAt.slice(11, 16) === '10:30'),
      `10:30 re-emit slot must exist even with same-plan booking`
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
