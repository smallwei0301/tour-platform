/**
 * GH-1301 regression: runtime mapping/evaluator path for dynamic re-emit
 *
 * These tests cover the two root-cause bugs identified in the close-gate failure:
 *
 * Bug A (route-handler.ts): AvailabilityRule mapping dropped use_dynamic_reemit.
 *   The rules mapping used `is_active: row.is_active` but omitted
 *   `use_dynamic_reemit: row.use_dynamic_reemit ?? false`, causing the flag to
 *   be undefined (treated as OFF) even after the migration applied the column.
 *
 * Bug B (availability-preview/route.ts): bookings fetched without guide_id.
 *   `slot-generator.getExistingBookings()` filters by `booking.guide_id !== guideId`,
 *   so bookings with undefined guide_id were all invisible to the generator.
 *   Re-emit never triggered because there were no visible conflicting bookings.
 *
 * Test fixture mirrors the close-gate scenario:
 *   rule: 09:00-12:00, slot_interval_minutes=60, buffer_after_minutes=30,
 *         use_dynamic_reemit=true
 *   plan: duration_minutes=60
 *   booking: 09:00-10:00 (confirmed)
 *   Expected: 10:30 slot appears (booking_end + buffer_after = 10:00 + 30 = 10:30)
 *
 * The tests exercise the evaluateBookingAvailability() evaluator path
 * (the same code path the traveler V2 route uses) plus the generateAvailableSlots()
 * path (the same code path the guide preview route uses).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  generateAvailableSlots,
  getExistingBookings,
} from '../../src/lib/slot-generator.ts';
import { evaluateBookingAvailability } from '../../src/lib/availability-v2/booking-availability-evaluator.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GUIDE_ID = 'guide-1301';
const PLAN_ID = 'plan-1301';
const ACTIVITY_ID = 'activity-1301';
const DATE_STR = '2025-01-06'; // Monday UTC

/** DB row shape returned by Supabase (before route-handler mapping) */
const DB_RULE_ROW = {
  id: 'rule-1301',
  guide_id: GUIDE_ID,
  activity_plan_id: PLAN_ID,
  weekday: 1,
  start_time_local: '09:00',
  end_time_local: '12:00',
  timezone: 'UTC',
  slot_interval_minutes: 60,
  buffer_before_minutes: 0,
  buffer_after_minutes: 30,
  effective_from: null,
  effective_to: null,
  is_active: true,
  use_dynamic_reemit: true, // persisted in DB after migration
};

const PLAN = {
  id: PLAN_ID,
  activity_id: ACTIVITY_ID,
  duration_minutes: 60,
  max_participants: 4,
  booking_type: 'scheduled',
};

/** Booking 09:00-10:00. booking.guide_id must be present for getExistingBookings to see it. */
const BOOKING_WITH_GUIDE_ID = {
  id: 'booking-1301',
  guide_id: GUIDE_ID,              // Bug B fix: guide_id must be present
  start_at: '2025-01-06T09:00:00.000Z',
  end_at: '2025-01-06T10:00:00.000Z',
  status: 'confirmed',
  participants: 1,
  activity_id: null,
  activity_plan_id: null,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
};

/** Same booking but guide_id omitted (simulates Bug B: old query without guide_id) */
const BOOKING_WITHOUT_GUIDE_ID = {
  ...BOOKING_WITH_GUIDE_ID,
  guide_id: undefined,
};

// ---------------------------------------------------------------------------
// Helper: simulate route-handler.ts AvailabilityRule mapping
// ---------------------------------------------------------------------------

/**
 * Bug A (broken): original mapping that dropped use_dynamic_reemit.
 * This is what the traveler V2 route did before the GH-1301 fix.
 */
function mapRuleBuggy(row) {
  return {
    id: row.id,
    guide_id: row.guide_id,
    activity_plan_id: row.activity_plan_id,
    weekday: row.weekday,
    start_time_local: row.start_time_local,
    end_time_local: row.end_time_local,
    timezone: row.timezone,
    slot_interval_minutes: row.slot_interval_minutes,
    buffer_before_minutes: row.buffer_before_minutes,
    buffer_after_minutes: row.buffer_after_minutes,
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    is_active: row.is_active,
    // use_dynamic_reemit intentionally omitted — this is the bug
  };
}

/**
 * Bug A (fixed): mapping after the GH-1301 fix.
 */
function mapRuleFixed(row) {
  return {
    ...mapRuleBuggy(row),
    use_dynamic_reemit: row.use_dynamic_reemit ?? false,
  };
}

// ---------------------------------------------------------------------------
// 1. Bug A: route-handler mapping must propagate use_dynamic_reemit
// ---------------------------------------------------------------------------

describe('GH-1301 Bug A — route-handler.ts mapping propagates use_dynamic_reemit', () => {
  it('BROKEN: mapping without use_dynamic_reemit loses the flag (undefined treated as false)', () => {
    const rule = mapRuleBuggy(DB_RULE_ROW);
    // Demonstrate the broken state: flag is undefined/falsy
    assert.ok(
      !rule.use_dynamic_reemit,
      `broken mapping: use_dynamic_reemit should be falsy but got ${rule.use_dynamic_reemit}`
    );
  });

  it('FIXED: mapping with use_dynamic_reemit preserves the flag from DB row', () => {
    const rule = mapRuleFixed(DB_RULE_ROW);
    assert.strictEqual(
      rule.use_dynamic_reemit,
      true,
      'fixed mapping must preserve use_dynamic_reemit=true from DB row'
    );
  });

  it('BROKEN → no 10:30 slot (flag lost, re-emit never fires)', () => {
    const rule = mapRuleBuggy(DB_RULE_ROW);
    const result = generateAvailableSlots(
      {
        guideId: GUIDE_ID,
        activityPlanId: PLAN_ID,
        dateFrom: DATE_STR,
        dateTo: DATE_STR,
        timezone: 'UTC',
        participants: 1,
      },
      {
        rules: [rule],
        blackouts: [],
        bookings: [BOOKING_WITH_GUIDE_ID],
        plan: PLAN,
      }
    );
    const starts = result.slots.map((s) => s.startAt);
    assert.ok(
      !starts.some((s) => s.includes('T10:30')),
      `broken path must NOT produce 10:30 slot; got: ${starts.join(', ')}`
    );
  });

  it('FIXED → 10:30 slot appears (flag preserved, re-emit fires)', () => {
    const rule = mapRuleFixed(DB_RULE_ROW);
    const result = generateAvailableSlots(
      {
        guideId: GUIDE_ID,
        activityPlanId: PLAN_ID,
        dateFrom: DATE_STR,
        dateTo: DATE_STR,
        timezone: 'UTC',
        participants: 1,
      },
      {
        rules: [rule],
        blackouts: [],
        bookings: [BOOKING_WITH_GUIDE_ID],
        plan: PLAN,
      }
    );
    const starts = result.slots.map((s) => s.startAt);
    assert.ok(
      starts.some((s) => s.includes('T10:30')),
      `fixed path must produce 10:30 slot; got: ${starts.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Bug B: guide preview booking query must include guide_id
// ---------------------------------------------------------------------------

describe('GH-1301 Bug B — guide preview booking query must include guide_id', () => {
  it('BROKEN: booking without guide_id is invisible to getExistingBookings', () => {
    const rangeStart = new Date('2025-01-06T00:00:00Z');
    const rangeEnd = new Date('2025-01-06T23:59:59Z');
    const visible = getExistingBookings(
      [BOOKING_WITHOUT_GUIDE_ID],
      GUIDE_ID,
      rangeStart,
      rangeEnd
    );
    assert.strictEqual(
      visible.length,
      0,
      'without guide_id, booking must be invisible to getExistingBookings'
    );
  });

  it('FIXED: booking with guide_id is visible to getExistingBookings', () => {
    const rangeStart = new Date('2025-01-06T00:00:00Z');
    const rangeEnd = new Date('2025-01-06T23:59:59Z');
    const visible = getExistingBookings(
      [BOOKING_WITH_GUIDE_ID],
      GUIDE_ID,
      rangeStart,
      rangeEnd
    );
    assert.strictEqual(
      visible.length,
      1,
      'with guide_id, booking must be visible to getExistingBookings'
    );
  });

  it('BROKEN → no 10:30 slot (bookings invisible, no conflict to re-emit from)', () => {
    const rule = mapRuleFixed(DB_RULE_ROW); // rule correctly mapped
    const result = generateAvailableSlots(
      {
        guideId: GUIDE_ID,
        activityPlanId: PLAN_ID,
        dateFrom: DATE_STR,
        dateTo: DATE_STR,
        timezone: 'UTC',
        participants: 1,
      },
      {
        rules: [rule],
        blackouts: [],
        bookings: [BOOKING_WITHOUT_GUIDE_ID], // Bug B: guide_id missing
        plan: PLAN,
      }
    );
    const starts = result.slots.map((s) => s.startAt);
    // Without bookings visible, no conflict → no re-emit → 10:30 absent
    assert.ok(
      !starts.some((s) => s.includes('T10:30')),
      `without guide_id in booking, 10:30 must not appear; got: ${starts.join(', ')}`
    );
  });

  it('FIXED → 10:30 slot appears (booking visible, re-emit fires)', () => {
    const rule = mapRuleFixed(DB_RULE_ROW);
    const result = generateAvailableSlots(
      {
        guideId: GUIDE_ID,
        activityPlanId: PLAN_ID,
        dateFrom: DATE_STR,
        dateTo: DATE_STR,
        timezone: 'UTC',
        participants: 1,
      },
      {
        rules: [rule],
        blackouts: [],
        bookings: [BOOKING_WITH_GUIDE_ID], // Bug B fixed: guide_id present
        plan: PLAN,
      }
    );
    const starts = result.slots.map((s) => s.startAt);
    assert.ok(
      starts.some((s) => s.includes('T10:30')),
      `with guide_id in booking, 10:30 must appear; got: ${starts.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Evaluator path (booking-availability-evaluator.ts) — traveler V2 surface
// ---------------------------------------------------------------------------

describe('GH-1301 evaluateBookingAvailability — traveler V2 runtime path', () => {
  it('BROKEN evaluator path: no 10:30 when use_dynamic_reemit dropped by mapping', () => {
    const rule = mapRuleBuggy(DB_RULE_ROW); // Bug A: flag dropped
    const result = evaluateBookingAvailability({
      guideId: GUIDE_ID,
      activityId: ACTIVITY_ID,
      planId: PLAN_ID,
      timezone: 'UTC',
      participants: 1,
      dateFrom: DATE_STR,
      dateTo: DATE_STR,
      minParticipants: 1,
      rules: [rule],
      blackouts: [],
      bookings: [BOOKING_WITH_GUIDE_ID],
      plan: PLAN,
    });
    const starts = result.slots.map((s) => s.startAt);
    assert.ok(
      !starts.some((s) => s.includes('T10:30')),
      `broken evaluator path must NOT have 10:30; got: ${starts.join(', ')}`
    );
  });

  it('FIXED evaluator path: 10:30 appears when use_dynamic_reemit is preserved', () => {
    const rule = mapRuleFixed(DB_RULE_ROW); // Bug A fixed
    const result = evaluateBookingAvailability({
      guideId: GUIDE_ID,
      activityId: ACTIVITY_ID,
      planId: PLAN_ID,
      timezone: 'UTC',
      participants: 1,
      dateFrom: DATE_STR,
      dateTo: DATE_STR,
      minParticipants: 1,
      rules: [rule],
      blackouts: [],
      bookings: [BOOKING_WITH_GUIDE_ID],
      plan: PLAN,
    });
    const starts = result.slots.map((s) => s.startAt);
    assert.ok(
      starts.some((s) => s.includes('T10:30')),
      `fixed evaluator path must have 10:30 slot; got: ${starts.join(', ')}`
    );
  });

  it('default OFF: evaluator with use_dynamic_reemit=false emits fixed grid (no re-emit)', () => {
    const ruleOff = { ...mapRuleFixed(DB_RULE_ROW), use_dynamic_reemit: false };
    const result = evaluateBookingAvailability({
      guideId: GUIDE_ID,
      activityId: ACTIVITY_ID,
      planId: PLAN_ID,
      timezone: 'UTC',
      participants: 1,
      dateFrom: DATE_STR,
      dateTo: DATE_STR,
      minParticipants: 1,
      rules: [ruleOff],
      blackouts: [],
      bookings: [BOOKING_WITH_GUIDE_ID],
      plan: PLAN,
    });
    const starts = result.slots.map((s) => s.startAt);
    // OFF path: booking 09:00-10:00 + buffer 30min → conflict window 09:00-10:30
    // grid: 09:00 (conflict), 10:00 (conflict), 11:00 (after 10:30 → OK)
    assert.ok(
      !starts.some((s) => s.includes('T10:30')),
      `OFF path must not have 10:30 re-emit; got: ${starts.join(', ')}`
    );
    assert.ok(
      starts.some((s) => s.includes('T11:00')),
      `OFF path must have 11:00 fixed-grid slot; got: ${starts.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Guide preview surface (generateAvailableSlots) — parity with traveler
// ---------------------------------------------------------------------------

describe('GH-1301 guide preview surface — generateAvailableSlots parity', () => {
  it('guide preview with both fixes: 10:30 appears (parity with traveler evaluator)', () => {
    const rule = mapRuleFixed(DB_RULE_ROW);
    const result = generateAvailableSlots(
      {
        guideId: GUIDE_ID,
        activityPlanId: PLAN_ID,
        dateFrom: DATE_STR,
        dateTo: DATE_STR,
        timezone: 'UTC',
        participants: 1,
      },
      {
        rules: [rule],
        blackouts: [],
        bookings: [BOOKING_WITH_GUIDE_ID],
        plan: PLAN,
      }
    );
    const starts = result.slots.map((s) => s.startAt);
    assert.ok(
      starts.some((s) => s.includes('T10:30')),
      `guide preview fixed: 10:30 must appear; got: ${starts.join(', ')}`
    );
  });

  it('guide preview with use_dynamic_reemit=false preserves default fixed-grid behavior', () => {
    const ruleOff = { ...mapRuleFixed(DB_RULE_ROW), use_dynamic_reemit: false };
    const result = generateAvailableSlots(
      {
        guideId: GUIDE_ID,
        activityPlanId: PLAN_ID,
        dateFrom: DATE_STR,
        dateTo: DATE_STR,
        timezone: 'UTC',
        participants: 1,
      },
      {
        rules: [ruleOff],
        blackouts: [],
        bookings: [BOOKING_WITH_GUIDE_ID],
        plan: PLAN,
      }
    );
    const starts = result.slots.map((s) => s.startAt);
    assert.ok(
      !starts.some((s) => s.includes('T10:30')),
      `OFF path must not re-emit; got: ${starts.join(', ')}`
    );
  });
});
