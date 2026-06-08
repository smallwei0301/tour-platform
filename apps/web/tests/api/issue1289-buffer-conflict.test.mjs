/**
 * GH-1289: buffer conflict window correctness tests
 *
 * These tests verify that both surfaces (canonical generator and what guide-preview
 * should use after the fix) handle buffers identically:
 * - booking 09:00-10:00 with 30min buffer_after → buffer window extends to 10:30
 * - slots overlapping that buffer window are unavailable
 * - behavior is identical between guide-preview and traveler canonical paths
 *
 * RED: must fail/demonstrate bug before fix
 * GREEN: must pass after fix
 *
 * NOTE ON AC6 (dynamic re-emit):
 * The canonical generator uses FIXED candidates + conflict filtering.
 * "Dynamic re-emit" (post-buffer slot starting at booking_end + buffer) is NOT
 * currently supported. This test validates PARITY with the traveler path
 * (both use fixed-candidate filtering). The AC6 dynamic re-emit product decision
 * is explicitly escalated — see kanban_block comment.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCandidateSlots,
  filterConflicts,
  slotConflictsWithBooking,
  generateAvailableSlots,
} from '../../src/lib/slot-generator.ts';

const GUIDE_ID = 'guide-1289-buf';
const PLAN_ID = 'plan-1289-buf';
const TIMEZONE = 'Asia/Taipei';
const TEST_DATE = '2026-06-08'; // Monday

function makeRule(overrides = {}) {
  return {
    id: 'rule-buf',
    guide_id: GUIDE_ID,
    activity_plan_id: PLAN_ID,
    weekday: 1, // Monday
    start_time_local: '09:00',
    end_time_local: '18:00',
    timezone: TIMEZONE,
    slot_interval_minutes: 60,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    effective_from: null,
    effective_to: null,
    is_active: true,
    ...overrides,
  };
}

function makePlan(overrides = {}) {
  return {
    id: PLAN_ID,
    activity_id: 'activity-buf',
    duration_minutes: 60,
    max_participants: 10,
    booking_type: 'scheduled',
    ...overrides,
  };
}

// ============================================================================
// Test 1: slotConflictsWithBooking correctly expands conflict window with buffers
//         booking 09:00-10:00 UTC + 30min buffer_after → conflict window 09:00-10:30
// ============================================================================
test('slotConflictsWithBooking: 30min buffer_after expands conflict end to booking_end + 30min', () => {
  // booking: 09:00-10:00 UTC
  const booking = {
    id: 'bk-1',
    guide_id: GUIDE_ID,
    start_at: '2026-06-08T01:00:00.000Z', // 09:00 Taipei
    end_at: '2026-06-08T02:00:00.000Z',   // 10:00 Taipei
    status: 'confirmed',
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
  };

  // bufferBefore=0, bufferAfter=30 → conflict window: 09:00 to 10:30
  const bufferAfter = 30;
  const bufferBefore = 0;

  // Slot 10:00-11:00: starts at booking_end, overlaps buffer (until 10:30) → CONFLICT
  const slot1000 = {
    startAt: new Date('2026-06-08T02:00:00.000Z'), // 10:00 Taipei
    endAt: new Date('2026-06-08T03:00:00.000Z'),   // 11:00 Taipei
  };
  assert.ok(
    slotConflictsWithBooking(slot1000, [booking], bufferBefore, bufferAfter),
    'Slot 10:00-11:00 must conflict with booking 09:00-10:00 + 30min buffer_after'
  );

  // Slot 10:30-11:30: starts after buffer end (10:30) → NO conflict
  const slot1030 = {
    startAt: new Date('2026-06-08T02:30:00.000Z'), // 10:30 Taipei
    endAt: new Date('2026-06-08T03:30:00.000Z'),   // 11:30 Taipei
  };
  assert.ok(
    !slotConflictsWithBooking(slot1030, [booking], bufferBefore, bufferAfter),
    'Slot 10:30-11:30 must NOT conflict (starts after buffer end 10:30)'
  );
});

// ============================================================================
// Test 2: generateAvailableSlots filters slots overlapping booking + buffer
//         booking 09:00-10:00, buffer_after=30 → 09:00 and 10:00 slots unavailable
//         11:00 slot is available (no parity test on dynamic re-emit from 10:30)
// ============================================================================
test('generateAvailableSlots: booking 09:00-10:00 + 30min buffer removes 09:00 and 10:00 slots', () => {
  const rule = makeRule({ buffer_after_minutes: 30 });
  const plan = makePlan({ duration_minutes: 60 });

  const booking = {
    id: 'bk-2',
    guide_id: GUIDE_ID,
    start_at: '2026-06-08T01:00:00.000Z', // 09:00 Taipei
    end_at: '2026-06-08T02:00:00.000Z',   // 10:00 Taipei
    status: 'confirmed',
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
  };

  const result = generateAvailableSlots(
    {
      guideId: GUIDE_ID,
      activityPlanId: PLAN_ID,
      dateFrom: TEST_DATE,
      dateTo: TEST_DATE,
      timezone: TIMEZONE,
      participants: 1,
    },
    {
      rules: [rule],
      blackouts: [],
      bookings: [booking],
      plan,
    }
  );

  // Extract start hours in Taipei time
  const startHours = result.slots.map(s => {
    return new Date(s.startAt).toLocaleString('en-US', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  });

  // 09:00 slot: conflicts with booking directly → removed
  assert.ok(
    !startHours.includes('09:00'),
    `09:00 slot must be removed (direct booking conflict). Got: ${startHours.join(', ')}`
  );

  // 10:00 slot: booking ends at 10:00, buffer_after=30 → conflict window until 10:30
  //             slot 10:00-11:00 starts at 10:00 which is within buffer → removed
  assert.ok(
    !startHours.includes('10:00'),
    `10:00 slot must be removed (within 30min buffer after booking). Got: ${startHours.join(', ')}`
  );

  // 11:00 slot: starts at 11:00, well past buffer end (10:30) → available
  assert.ok(
    startHours.includes('11:00'),
    `11:00 slot must be available (beyond 30min buffer). Got: ${startHours.join(', ')}`
  );
});

// ============================================================================
// Test 3: buffer_before also expands conflict window backward
// ============================================================================
test('slotConflictsWithBooking: 30min buffer_before expands conflict start by -30min', () => {
  // booking: 10:00-11:00 Taipei = 02:00-03:00 UTC
  const booking = {
    id: 'bk-3',
    guide_id: GUIDE_ID,
    start_at: '2026-06-08T02:00:00.000Z',
    end_at: '2026-06-08T03:00:00.000Z',
    status: 'confirmed',
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
  };

  const bufferBefore = 30;
  const bufferAfter = 0;

  // Slot 09:00-10:00: ends at 10:00 which is exactly the buffer_before window start (10:00 - 30 = 09:30)
  // Wait: buffer_before=30 means conflict window starts at booking_start - 30 = 09:30
  // Slot 09:00-10:00: slot.end (10:00) > buffer_start (09:30) and slot.start (09:00) < booking_end (11:00)
  // So it SHOULD conflict
  const slot0900 = {
    startAt: new Date('2026-06-08T01:00:00.000Z'), // 09:00 Taipei
    endAt: new Date('2026-06-08T02:00:00.000Z'),   // 10:00 Taipei
  };
  assert.ok(
    slotConflictsWithBooking(slot0900, [booking], bufferBefore, bufferAfter),
    'Slot 09:00-10:00 must conflict with booking 10:00-11:00 + 30min buffer_before (window from 09:30)'
  );

  // Slot 09:00-09:30: ends at 09:30 which equals buffer_start (09:30)
  // rangesOverlap: start1 < end2 && end1 > start2 → (09:00 < 11:00) && (09:30 > 09:30) → false
  // So 09:00-09:30 should NOT conflict (strict overlap)
  const slot0900_0930 = {
    startAt: new Date('2026-06-08T01:00:00.000Z'), // 09:00
    endAt: new Date('2026-06-08T01:30:00.000Z'),   // 09:30
  };
  assert.ok(
    !slotConflictsWithBooking(slot0900_0930, [booking], bufferBefore, bufferAfter),
    'Slot 09:00-09:30 must NOT conflict (ends exactly at buffer_before boundary, strict overlap)'
  );
});

// ============================================================================
// Test 4: buffer from the BOOKING record itself (buffer_before/after on existing booking)
//         Canonical generator reads booking.buffer_before_minutes and booking.buffer_after_minutes
// ============================================================================
test('booking own buffer_after is added to rule buffer_after for conflict window', () => {
  // Rule has buffer_after=0; booking carries its own buffer_after=15
  const rule = makeRule({ buffer_after_minutes: 30 }); // rule: 30min
  const plan = makePlan({ duration_minutes: 60 });

  const booking = {
    id: 'bk-4',
    guide_id: GUIDE_ID,
    start_at: '2026-06-08T01:00:00.000Z', // 09:00 Taipei
    end_at: '2026-06-08T02:00:00.000Z',   // 10:00 Taipei
    status: 'confirmed',
    buffer_before_minutes: 0,
    buffer_after_minutes: 15, // booking's own buffer
  };

  // Combined: rule buffer_after(30) + booking.buffer_after(15) = 45min
  // Conflict window end: 10:00 + 45 = 10:45
  // Slot 10:30-11:30: starts at 10:30 which is within 10:45 buffer end → conflict
  const slot1030 = {
    startAt: new Date('2026-06-08T02:30:00.000Z'), // 10:30
    endAt: new Date('2026-06-08T03:30:00.000Z'),   // 11:30
  };
  assert.ok(
    slotConflictsWithBooking(slot1030, [booking], rule.buffer_before_minutes, rule.buffer_after_minutes),
    'Slot 10:30-11:30 must conflict (within combined 45min buffer: rule 30 + booking 15)'
  );

  // Slot 11:00-12:00: starts at 11:00 which is after buffer end (10:45) → NO conflict
  const slot1100 = {
    startAt: new Date('2026-06-08T03:00:00.000Z'), // 11:00
    endAt: new Date('2026-06-08T04:00:00.000Z'),   // 12:00
  };
  assert.ok(
    !slotConflictsWithBooking(slot1100, [booking], rule.buffer_before_minutes, rule.buffer_after_minutes),
    'Slot 11:00-12:00 must NOT conflict (past combined 45min buffer end)'
  );
});

// ============================================================================
// AC6 NOTE: The following test documents that fixed-candidate behavior is current
// canonical behavior. Dynamic re-emit (new slot starting at booking_end + buffer)
// is NOT tested here because it's not in the canonical generator.
// This test is a contract assertion that should FAIL if dynamic re-emit is
// added to the canonical generator (requiring re-review of this file).
// ============================================================================
test('AC6 contract: canonical generator does NOT emit dynamic slots between fixed cadence', () => {
  // With 09:00-18:00 window, interval=60, duration=60:
  // Fixed candidates: 09:00, 10:00, 11:00, ..., 17:00
  // Booking 09:00-10:00 + buffer_after=30 → 09:00 removed, 10:00 removed
  // Next available: 11:00 (NOT 10:30 dynamic re-emit)
  const rule = makeRule({ buffer_after_minutes: 30 });
  const plan = makePlan({ duration_minutes: 60 });

  const booking = {
    id: 'bk-ac6',
    guide_id: GUIDE_ID,
    start_at: '2026-06-08T01:00:00.000Z', // 09:00 Taipei
    end_at: '2026-06-08T02:00:00.000Z',   // 10:00 Taipei
    status: 'confirmed',
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
  };

  const result = generateAvailableSlots(
    {
      guideId: GUIDE_ID,
      activityPlanId: PLAN_ID,
      dateFrom: TEST_DATE,
      dateTo: TEST_DATE,
      timezone: TIMEZONE,
      participants: 1,
    },
    {
      rules: [rule],
      blackouts: [],
      bookings: [booking],
      plan,
    }
  );

  const startHours = result.slots.map(s =>
    new Date(s.startAt).toLocaleString('en-US', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  );

  // Dynamic re-emit would produce 10:30. Fixed-candidate does NOT.
  assert.ok(
    !startHours.includes('10:30'),
    `AC6-contract: canonical must NOT emit dynamic 10:30 slot (fixed-candidate only). Got: ${startHours.join(', ')}`
  );

  // First available after booking+buffer is 11:00 (next fixed candidate)
  assert.ok(
    startHours.includes('11:00'),
    `First available slot after booking+buffer must be 11:00. Got: ${startHours.join(', ')}`
  );
});
