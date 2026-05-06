/**
 * Slot Generator Engine Tests (TP-BP-003)
 *
 * Comprehensive unit tests covering:
 * - Timezone handling
 * - Blackout date filtering
 * - Overlap detection
 * - Buffer logic (before/after)
 * - Different durations
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// We import from the compiled JS or use dynamic import for TS
// For now, we'll test the module directly with ts-node or after compilation
import {
  parseTimeString,
  getWeekdayInTimezone,
  getDateStringInTimezone,
  createDateInTimezone,
  addMinutes,
  addDays,
  rangesOverlap,
  isDateInRange,
  formatDateWithTimezone,
  generateDateRange,
  getAvailabilityRules,
  getBlackoutWindows,
  getExistingBookings,
  buildCandidateSlots,
  slotConflictsWithBlackout,
  slotConflictsWithBooking,
  filterConflicts,
  serializeSlots,
  generateAvailableSlots,
  validateSlotAvailability,
} from '../src/lib/slot-generator.ts';

// ============================================================================
// Test Data Fixtures
// ============================================================================

const GUIDE_ID = 'guide_001';
const PLAN_ID = 'plan_001';
const TIMEZONE_TAIPEI = 'Asia/Taipei';
const TIMEZONE_UTC = 'UTC';
const TIMEZONE_LA = 'America/Los_Angeles';

function createMockRule(overrides = {}) {
  return {
    id: 'rule_001',
    guide_id: GUIDE_ID,
    activity_plan_id: PLAN_ID,
    weekday: 1, // Monday
    start_time_local: '09:00',
    end_time_local: '17:00',
    timezone: TIMEZONE_TAIPEI,
    slot_interval_minutes: 60,
    buffer_before_minutes: 0,
    buffer_after_minutes: 30,
    effective_from: null,
    effective_to: null,
    is_active: true,
    ...overrides,
  };
}

function createMockBlackout(overrides = {}) {
  return {
    id: 'blackout_001',
    guide_id: GUIDE_ID,
    starts_at: '2026-04-20T01:00:00Z', // 09:00 Taipei
    ends_at: '2026-04-20T05:00:00Z', // 13:00 Taipei
    reason: 'Personal time',
    source: 'manual',
    ...overrides,
  };
}

function createMockBooking(overrides = {}) {
  return {
    id: 'booking_001',
    guide_id: GUIDE_ID,
    start_at: '2026-04-21T01:00:00Z', // 09:00 Taipei on Tuesday
    end_at: '2026-04-21T05:00:00Z', // 13:00 Taipei
    status: 'confirmed',
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    ...overrides,
  };
}

function createMockPlan(overrides = {}) {
  return {
    id: PLAN_ID,
    activity_id: 'activity_001',
    duration_minutes: 240, // 4 hours
    max_participants: 4,
    booking_type: 'instant',
    ...overrides,
  };
}

// ============================================================================
// Date/Time Utilities Tests
// ============================================================================

test('parseTimeString parses HH:MM format correctly', () => {
  assert.deepEqual(parseTimeString('09:00'), { hours: 9, minutes: 0 });
  assert.deepEqual(parseTimeString('14:30'), { hours: 14, minutes: 30 });
  assert.deepEqual(parseTimeString('00:00'), { hours: 0, minutes: 0 });
  assert.deepEqual(parseTimeString('23:59'), { hours: 23, minutes: 59 });
});

test('getWeekdayInTimezone returns correct weekday for different timezones', () => {
  // 2026-04-20 is a Monday
  const mondayUTC = new Date('2026-04-20T12:00:00Z');
  assert.equal(getWeekdayInTimezone(mondayUTC, 'UTC'), 1);
  assert.equal(getWeekdayInTimezone(mondayUTC, TIMEZONE_TAIPEI), 1);

  // Sunday 23:00 UTC is Monday 07:00 in Taipei (UTC+8)
  const sundayNightUTC = new Date('2026-04-19T23:00:00Z');
  assert.equal(getWeekdayInTimezone(sundayNightUTC, 'UTC'), 0); // Sunday
  assert.equal(getWeekdayInTimezone(sundayNightUTC, TIMEZONE_TAIPEI), 1); // Monday in Taipei
});

test('getDateStringInTimezone returns correct date string', () => {
  const date = new Date('2026-04-20T12:00:00Z');
  assert.equal(getDateStringInTimezone(date, 'UTC'), '2026-04-20');
  assert.equal(getDateStringInTimezone(date, TIMEZONE_TAIPEI), '2026-04-20');

  // Late night UTC becomes next day in Taipei
  const lateUTC = new Date('2026-04-20T20:00:00Z');
  assert.equal(getDateStringInTimezone(lateUTC, 'UTC'), '2026-04-20');
  assert.equal(getDateStringInTimezone(lateUTC, TIMEZONE_TAIPEI), '2026-04-21');
});

test('createDateInTimezone creates correct UTC date for local time', () => {
  // 09:00 in Taipei (UTC+8) should be 01:00 UTC
  const taipeiMorning = createDateInTimezone('2026-04-20', '09:00', TIMEZONE_TAIPEI);
  assert.equal(taipeiMorning.getUTCHours(), 1);
  assert.equal(taipeiMorning.getUTCDate(), 20);

  // 09:00 UTC should be 09:00 UTC
  const utcMorning = createDateInTimezone('2026-04-20', '09:00', 'UTC');
  assert.equal(utcMorning.getUTCHours(), 9);
});

test('addMinutes adds minutes correctly', () => {
  const start = new Date('2026-04-20T09:00:00Z');
  const plus30 = addMinutes(start, 30);
  assert.equal(plus30.getUTCHours(), 9);
  assert.equal(plus30.getUTCMinutes(), 30);

  const plus120 = addMinutes(start, 120);
  assert.equal(plus120.getUTCHours(), 11);
  assert.equal(plus120.getUTCMinutes(), 0);

  // Negative minutes
  const minus60 = addMinutes(start, -60);
  assert.equal(minus60.getUTCHours(), 8);
});

test('addDays adds days correctly', () => {
  const start = new Date('2026-04-20T09:00:00Z');
  const plus1 = addDays(start, 1);
  assert.equal(plus1.getUTCDate(), 21);

  const plus7 = addDays(start, 7);
  assert.equal(plus7.getUTCDate(), 27);
});

test('rangesOverlap detects overlapping ranges', () => {
  const start1 = new Date('2026-04-20T09:00:00Z');
  const end1 = new Date('2026-04-20T13:00:00Z');

  // Overlapping range
  const start2 = new Date('2026-04-20T12:00:00Z');
  const end2 = new Date('2026-04-20T16:00:00Z');
  assert.equal(rangesOverlap(start1, end1, start2, end2), true);

  // Non-overlapping range (after)
  const start3 = new Date('2026-04-20T14:00:00Z');
  const end3 = new Date('2026-04-20T18:00:00Z');
  assert.equal(rangesOverlap(start1, end1, start3, end3), false);

  // Non-overlapping range (before)
  const start4 = new Date('2026-04-20T05:00:00Z');
  const end4 = new Date('2026-04-20T08:00:00Z');
  assert.equal(rangesOverlap(start1, end1, start4, end4), false);

  // Adjacent ranges (end equals start) - should NOT overlap
  const start5 = new Date('2026-04-20T13:00:00Z');
  const end5 = new Date('2026-04-20T17:00:00Z');
  assert.equal(rangesOverlap(start1, end1, start5, end5), false);

  // Contained range
  const start6 = new Date('2026-04-20T10:00:00Z');
  const end6 = new Date('2026-04-20T12:00:00Z');
  assert.equal(rangesOverlap(start1, end1, start6, end6), true);
});

test('isDateInRange checks date boundaries correctly', () => {
  assert.equal(isDateInRange('2026-04-20', null, null), true);
  assert.equal(isDateInRange('2026-04-20', '2026-04-15', null), true);
  assert.equal(isDateInRange('2026-04-20', '2026-04-25', null), false);
  assert.equal(isDateInRange('2026-04-20', null, '2026-04-25'), true);
  assert.equal(isDateInRange('2026-04-20', null, '2026-04-15'), false);
  assert.equal(isDateInRange('2026-04-20', '2026-04-15', '2026-04-25'), true);
  assert.equal(isDateInRange('2026-04-20', '2026-04-20', '2026-04-20'), true);
});

test('generateDateRange generates all dates in range', () => {
  const dates = generateDateRange('2026-04-20', '2026-04-23');
  assert.deepEqual(dates, ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23']);

  const singleDay = generateDateRange('2026-04-20', '2026-04-20');
  assert.deepEqual(singleDay, ['2026-04-20']);
});

test('formatDateWithTimezone formats with correct offset', () => {
  const date = new Date('2026-04-20T01:00:00Z');
  const formatted = formatDateWithTimezone(date, TIMEZONE_TAIPEI);
  // Should show 09:00:00+08:00
  assert.ok(formatted.includes('09:00:00'));
  assert.ok(formatted.includes('+08:00'));
});

// ============================================================================
// Availability Rules Tests
// ============================================================================

test('getAvailabilityRules filters by guide and plan', () => {
  const rules = [
    createMockRule({ id: 'r1', guide_id: GUIDE_ID, activity_plan_id: PLAN_ID }),
    createMockRule({ id: 'r2', guide_id: GUIDE_ID, activity_plan_id: null }), // applies to all plans
    createMockRule({ id: 'r3', guide_id: 'other_guide', activity_plan_id: PLAN_ID }),
    createMockRule({ id: 'r4', guide_id: GUIDE_ID, activity_plan_id: 'other_plan' }),
    createMockRule({ id: 'r5', guide_id: GUIDE_ID, activity_plan_id: PLAN_ID, is_active: false }),
  ];

  const result = getAvailabilityRules(rules, GUIDE_ID, PLAN_ID);
  assert.equal(result.length, 2);
  assert.ok(result.some((r) => r.id === 'r1'));
  assert.ok(result.some((r) => r.id === 'r2'));
});

test('getAvailabilityRules excludes inactive rules', () => {
  const rules = [
    createMockRule({ is_active: true }),
    createMockRule({ id: 'r2', is_active: false }),
  ];

  const result = getAvailabilityRules(rules, GUIDE_ID, PLAN_ID);
  assert.equal(result.length, 1);
});

// ============================================================================
// Blackout Windows Tests
// ============================================================================

test('getBlackoutWindows filters by guide and date range', () => {
  const blackouts = [
    createMockBlackout({ id: 'b1', guide_id: GUIDE_ID }),
    createMockBlackout({ id: 'b2', guide_id: 'other_guide' }),
    createMockBlackout({
      id: 'b3',
      guide_id: GUIDE_ID,
      starts_at: '2026-05-01T00:00:00Z',
      ends_at: '2026-05-02T00:00:00Z',
    }),
  ];

  const rangeStart = new Date('2026-04-19T00:00:00Z');
  const rangeEnd = new Date('2026-04-25T23:59:59Z');

  const result = getBlackoutWindows(blackouts, GUIDE_ID, rangeStart, rangeEnd);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'b1');
});

test('slotConflictsWithBlackout detects conflicts correctly', () => {
  const blackouts = [
    createMockBlackout({
      starts_at: '2026-04-20T01:00:00Z', // 09:00 Taipei
      ends_at: '2026-04-20T05:00:00Z', // 13:00 Taipei
    }),
  ];

  // Slot during blackout
  const conflictingSlot = {
    startAt: new Date('2026-04-20T02:00:00Z'), // 10:00 Taipei
    endAt: new Date('2026-04-20T04:00:00Z'), // 12:00 Taipei
  };
  assert.equal(slotConflictsWithBlackout(conflictingSlot, blackouts), true);

  // Slot before blackout
  const beforeSlot = {
    startAt: new Date('2026-04-19T23:00:00Z'), // 07:00 Taipei
    endAt: new Date('2026-04-20T01:00:00Z'), // 09:00 Taipei (ends exactly when blackout starts)
  };
  assert.equal(slotConflictsWithBlackout(beforeSlot, blackouts), false);

  // Slot after blackout
  const afterSlot = {
    startAt: new Date('2026-04-20T05:00:00Z'), // 13:00 Taipei
    endAt: new Date('2026-04-20T09:00:00Z'), // 17:00 Taipei
  };
  assert.equal(slotConflictsWithBlackout(afterSlot, blackouts), false);
});

// ============================================================================
// Existing Bookings Tests
// ============================================================================

test('getExistingBookings filters by guide and date range', () => {
  const bookings = [
    createMockBooking({ id: 'bk1', guide_id: GUIDE_ID, status: 'confirmed' }),
    createMockBooking({ id: 'bk2', guide_id: 'other_guide', status: 'confirmed' }),
    createMockBooking({ id: 'bk3', guide_id: GUIDE_ID, status: 'cancelled' }), // excluded
    createMockBooking({ id: 'bk4', guide_id: GUIDE_ID, status: 'completed' }), // excluded
    createMockBooking({ id: 'bk5', guide_id: GUIDE_ID, status: 'pending_confirmation' }),
  ];

  const rangeStart = new Date('2026-04-19T00:00:00Z');
  const rangeEnd = new Date('2026-04-25T23:59:59Z');

  const result = getExistingBookings(bookings, GUIDE_ID, rangeStart, rangeEnd);
  assert.equal(result.length, 2);
  assert.ok(result.some((b) => b.id === 'bk1'));
  assert.ok(result.some((b) => b.id === 'bk5'));
});

test('slotConflictsWithBooking detects conflicts with buffers', () => {
  const bookings = [
    createMockBooking({
      start_at: '2026-04-21T01:00:00Z', // 09:00 Taipei
      end_at: '2026-04-21T05:00:00Z', // 13:00 Taipei
    }),
  ];

  // Direct overlap
  const overlappingSlot = {
    startAt: new Date('2026-04-21T02:00:00Z'),
    endAt: new Date('2026-04-21T06:00:00Z'),
  };
  assert.equal(slotConflictsWithBooking(overlappingSlot, bookings, 0, 0), true);

  // Slot ends exactly when booking starts - no conflict
  const beforeSlot = {
    startAt: new Date('2026-04-20T21:00:00Z'), // 05:00 Taipei
    endAt: new Date('2026-04-21T01:00:00Z'), // 09:00 Taipei
  };
  assert.equal(slotConflictsWithBooking(beforeSlot, bookings, 0, 0), false);

  // With buffer_after = 30 min, the slot extending into buffer should conflict
  const bufferConflictSlot = {
    startAt: new Date('2026-04-21T05:00:00Z'), // 13:00 Taipei (booking ends)
    endAt: new Date('2026-04-21T09:00:00Z'), // 17:00 Taipei
  };
  assert.equal(slotConflictsWithBooking(bufferConflictSlot, bookings, 0, 30), true);

  // Slot after the buffer period - no conflict
  const afterBufferSlot = {
    startAt: new Date('2026-04-21T05:30:00Z'), // 13:30 Taipei
    endAt: new Date('2026-04-21T09:30:00Z'), // 17:30 Taipei
  };
  assert.equal(slotConflictsWithBooking(afterBufferSlot, bookings, 0, 30), false);
});

test('slotConflictsWithBooking respects buffer_before', () => {
  const bookings = [
    createMockBooking({
      start_at: '2026-04-21T05:00:00Z', // 13:00 Taipei
      end_at: '2026-04-21T09:00:00Z', // 17:00 Taipei
    }),
  ];

  // Slot ending inside the 30 min buffer_before window should conflict
  const bufferBeforeConflict = {
    startAt: new Date('2026-04-21T00:45:00Z'), // 08:45 Taipei
    endAt: new Date('2026-04-21T04:45:00Z'), // 12:45 Taipei
  };
  assert.equal(slotConflictsWithBooking(bufferBeforeConflict, bookings, 30, 0), true);

  // Slot ending 31 min before booking - no conflict with 30 min buffer_before
  const noConflictSlot = {
    startAt: new Date('2026-04-21T00:29:00Z'), // 08:29 Taipei
    endAt: new Date('2026-04-21T04:29:00Z'), // 12:29 Taipei
  };
  assert.equal(slotConflictsWithBooking(noConflictSlot, bookings, 30, 0), false);
});

// ============================================================================
// Candidate Slots Building Tests
// ============================================================================

test('buildCandidateSlots generates correct slots for a day', () => {
  const rule = createMockRule({
    start_time_local: '09:00',
    end_time_local: '17:00',
    slot_interval_minutes: 60,
    timezone: TIMEZONE_TAIPEI,
  });

  // 4-hour duration with 60-min intervals
  // 09:00-13:00, 10:00-14:00, 11:00-15:00, 12:00-16:00, 13:00-17:00
  const slots = buildCandidateSlots(rule, 240, '2026-04-20');
  assert.equal(slots.length, 5);

  // First slot should start at 09:00 Taipei (01:00 UTC)
  assert.equal(slots[0].startAt.getUTCHours(), 1);
  assert.equal(slots[0].endAt.getUTCHours(), 5);
});

test('buildCandidateSlots respects effective date range', () => {
  const rule = createMockRule({
    effective_from: '2026-04-15',
    effective_to: '2026-04-25',
  });

  // Date within range
  const withinRange = buildCandidateSlots(rule, 240, '2026-04-20');
  assert.ok(withinRange.length > 0);

  // Date before range
  const beforeRange = buildCandidateSlots(rule, 240, '2026-04-10');
  assert.equal(beforeRange.length, 0);

  // Date after range
  const afterRange = buildCandidateSlots(rule, 240, '2026-04-30');
  assert.equal(afterRange.length, 0);
});

test('buildCandidateSlots handles different durations', () => {
  const rule = createMockRule({
    start_time_local: '09:00',
    end_time_local: '17:00',
    slot_interval_minutes: 30,
  });

  // 2-hour duration
  const slots2h = buildCandidateSlots(rule, 120, '2026-04-20');
  // From 09:00-11:00 to 15:00-17:00, every 30 min = 13 slots
  assert.equal(slots2h.length, 13);

  // 8-hour duration (full day)
  const slots8h = buildCandidateSlots(rule, 480, '2026-04-20');
  // Only 09:00-17:00 fits
  assert.equal(slots8h.length, 1);

  // 9-hour duration (too long)
  const slots9h = buildCandidateSlots(rule, 540, '2026-04-20');
  assert.equal(slots9h.length, 0);
});

test('buildCandidateSlots handles slot intervals correctly', () => {
  const rule = createMockRule({
    start_time_local: '09:00',
    end_time_local: '13:00',
    slot_interval_minutes: 30,
  });

  // 2-hour duration with 30-min intervals
  // 09:00-11:00, 09:30-11:30, 10:00-12:00, 10:30-12:30, 11:00-13:00
  const slots = buildCandidateSlots(rule, 120, '2026-04-20');
  assert.equal(slots.length, 5);
});

// ============================================================================
// Filter Conflicts Tests
// ============================================================================

test('filterConflicts removes slots that conflict with blackouts', () => {
  const candidates = [
    { startAt: new Date('2026-04-20T01:00:00Z'), endAt: new Date('2026-04-20T05:00:00Z') },
    { startAt: new Date('2026-04-20T05:00:00Z'), endAt: new Date('2026-04-20T09:00:00Z') },
  ];

  const blackouts = [
    createMockBlackout({
      starts_at: '2026-04-20T02:00:00Z',
      ends_at: '2026-04-20T04:00:00Z',
    }),
  ];

  const result = filterConflicts(candidates, blackouts, [], 0, 0);
  assert.equal(result.length, 1);
  assert.equal(result[0].startAt.getUTCHours(), 5);
});

test('filterConflicts removes slots that conflict with bookings', () => {
  const candidates = [
    { startAt: new Date('2026-04-20T01:00:00Z'), endAt: new Date('2026-04-20T05:00:00Z') },
    { startAt: new Date('2026-04-20T05:00:00Z'), endAt: new Date('2026-04-20T09:00:00Z') },
  ];

  const bookings = [
    createMockBooking({
      start_at: '2026-04-20T01:00:00Z',
      end_at: '2026-04-20T05:00:00Z',
    }),
  ];

  const result = filterConflicts(candidates, [], bookings, 0, 0);
  assert.equal(result.length, 1);
  assert.equal(result[0].startAt.getUTCHours(), 5);
});

test('filterConflicts respects buffer times', () => {
  const candidates = [
    { startAt: new Date('2026-04-20T01:00:00Z'), endAt: new Date('2026-04-20T05:00:00Z') },
    { startAt: new Date('2026-04-20T05:00:00Z'), endAt: new Date('2026-04-20T09:00:00Z') },
    { startAt: new Date('2026-04-20T05:30:00Z'), endAt: new Date('2026-04-20T09:30:00Z') },
  ];

  const bookings = [
    createMockBooking({
      start_at: '2026-04-20T01:00:00Z',
      end_at: '2026-04-20T05:00:00Z',
    }),
  ];

  // 30-min buffer after should block the 05:00 slot but not 05:30
  const result = filterConflicts(candidates, [], bookings, 0, 30);
  assert.equal(result.length, 1);
  assert.equal(result[0].startAt.getTime(), new Date('2026-04-20T05:30:00Z').getTime());
});

// ============================================================================
// Serialization Tests
// ============================================================================

test('serializeSlots formats slots correctly', () => {
  const slots = [
    { startAt: new Date('2026-04-20T01:00:00Z'), endAt: new Date('2026-04-20T05:00:00Z') },
  ];
  const plan = createMockPlan();

  const result = serializeSlots(slots, TIMEZONE_TAIPEI, plan, 1);
  assert.equal(result.length, 1);
  assert.ok(result[0].startAt.includes('09:00:00'));
  assert.ok(result[0].endAt.includes('13:00:00'));
  assert.equal(result[0].capacityLeft, 3); // max 4 - 1 = 3
  assert.equal(result[0].bookingType, 'instant');
  assert.equal(result[0].isAvailable, true);
});

test('serializeSlots capacityLeft means remaining participants (max - participants, min 0)', () => {
  const slots = [
    { startAt: new Date('2026-04-20T01:00:00Z'), endAt: new Date('2026-04-20T05:00:00Z') },
  ];
  const plan = createMockPlan({ max_participants: 4 });

  const participants1 = serializeSlots(slots, TIMEZONE_TAIPEI, plan, 1);
  const participants2 = serializeSlots(slots, TIMEZONE_TAIPEI, plan, 2);
  const participants4 = serializeSlots(slots, TIMEZONE_TAIPEI, plan, 4);

  assert.equal(participants1[0].capacityLeft, 3);
  assert.equal(participants2[0].capacityLeft, 2);
  assert.equal(participants4[0].capacityLeft, 0);
});

// ============================================================================
// Main Entry Point Tests
// ============================================================================

test('generateAvailableSlots integrates all components correctly', () => {
  const rules = [
    createMockRule({
      weekday: 1, // Monday
      start_time_local: '09:00',
      end_time_local: '17:00',
      slot_interval_minutes: 240, // 4-hour intervals
    }),
  ];

  const blackouts = [
    createMockBlackout({
      starts_at: '2026-04-20T01:00:00Z', // Blocks Monday 09:00 slot
      ends_at: '2026-04-20T05:00:00Z',
    }),
  ];

  const bookings = [];

  const plan = createMockPlan({ duration_minutes: 240 });

  const input = {
    guideId: GUIDE_ID,
    activityPlanId: PLAN_ID,
    dateFrom: '2026-04-20', // Monday
    dateTo: '2026-04-20',
    timezone: TIMEZONE_TAIPEI,
    participants: 2,
  };

  const result = generateAvailableSlots(input, { rules, blackouts, bookings, plan });

  // Should have 1 slot (13:00-17:00) since 09:00-13:00 is blacked out
  assert.equal(result.timezone, TIMEZONE_TAIPEI);
  assert.equal(result.slots.length, 1);
  assert.ok(result.slots[0].startAt.includes('13:00'));
});

test('generateAvailableSlots handles multiple days', () => {
  const rules = [
    createMockRule({
      weekday: 1, // Monday
      start_time_local: '09:00',
      end_time_local: '17:00',
      slot_interval_minutes: 240,
    }),
    createMockRule({
      id: 'rule_002',
      weekday: 2, // Tuesday
      start_time_local: '09:00',
      end_time_local: '17:00',
      slot_interval_minutes: 240,
    }),
  ];

  const plan = createMockPlan({ duration_minutes: 240 });

  const input = {
    guideId: GUIDE_ID,
    activityPlanId: PLAN_ID,
    dateFrom: '2026-04-20', // Monday
    dateTo: '2026-04-21', // Tuesday
    timezone: TIMEZONE_TAIPEI,
  };

  const result = generateAvailableSlots(input, { rules, blackouts: [], bookings: [], plan });

  // 2 slots per day (09:00-13:00, 13:00-17:00) x 2 days = 4 slots
  assert.equal(result.slots.length, 4);
});

test('generateAvailableSlots excludes days without matching rules', () => {
  const rules = [
    createMockRule({
      weekday: 1, // Monday only
    }),
  ];

  const plan = createMockPlan({ duration_minutes: 240 });

  const input = {
    guideId: GUIDE_ID,
    activityPlanId: PLAN_ID,
    dateFrom: '2026-04-20', // Monday
    dateTo: '2026-04-23', // Thursday
    timezone: TIMEZONE_TAIPEI,
  };

  const result = generateAvailableSlots(input, { rules, blackouts: [], bookings: [], plan });

  // Only Monday has slots
  assert.ok(result.slots.length > 0);
  // All slots should be on Monday
  result.slots.forEach((slot) => {
    assert.ok(slot.startAt.includes('2026-04-20'));
  });
});

// ============================================================================
// Timezone Edge Cases
// ============================================================================

test('handles timezone differences correctly (cross-day)', () => {
  // Rule is for Tuesday in LA timezone
  const rules = [
    createMockRule({
      weekday: 2, // Tuesday
      start_time_local: '09:00',
      end_time_local: '17:00',
      timezone: TIMEZONE_LA,
      slot_interval_minutes: 240,
    }),
  ];

  const plan = createMockPlan({ duration_minutes: 240 });

  // 2026-04-21 is Tuesday
  const input = {
    guideId: GUIDE_ID,
    activityPlanId: PLAN_ID,
    dateFrom: '2026-04-21',
    dateTo: '2026-04-21',
    timezone: TIMEZONE_LA,
  };

  const result = generateAvailableSlots(input, { rules, blackouts: [], bookings: [], plan });

  // Should have 2 slots
  assert.equal(result.slots.length, 2);
});

test('handles DST transitions correctly', () => {
  // This is a basic check - DST handling depends on the system's timezone database
  const rules = [
    createMockRule({
      weekday: 0, // Sunday
      start_time_local: '09:00',
      end_time_local: '17:00',
      timezone: TIMEZONE_LA,
    }),
  ];

  const plan = createMockPlan({ duration_minutes: 240 });

  // March 8, 2026 is when DST starts in LA
  const input = {
    guideId: GUIDE_ID,
    activityPlanId: PLAN_ID,
    dateFrom: '2026-03-08',
    dateTo: '2026-03-08',
    timezone: TIMEZONE_LA,
  };

  const result = generateAvailableSlots(input, { rules, blackouts: [], bookings: [], plan });

  // Should still generate slots correctly
  assert.ok(result.slots.length > 0);
});

// ============================================================================
// Validation Tests
// ============================================================================

test('validateSlotAvailability detects past slots', () => {
  const pastSlot = new Date(Date.now() - 3600000); // 1 hour ago
  const result = validateSlotAvailability(
    pastSlot.toISOString(),
    new Date(pastSlot.getTime() + 4 * 3600000).toISOString(),
    GUIDE_ID,
    { blackouts: [], bookings: [], bufferBefore: 0, bufferAfter: 0 }
  );

  assert.equal(result.available, false);
  assert.equal(result.reason, 'SLOT_IN_PAST');
});

test('validateSlotAvailability detects blackout conflicts', () => {
  const futureDate = new Date(Date.now() + 86400000); // Tomorrow
  const blackouts = [
    createMockBlackout({
      guide_id: GUIDE_ID,
      starts_at: new Date(futureDate.getTime() - 3600000).toISOString(),
      ends_at: new Date(futureDate.getTime() + 3600000).toISOString(),
    }),
  ];

  const result = validateSlotAvailability(
    futureDate.toISOString(),
    new Date(futureDate.getTime() + 4 * 3600000).toISOString(),
    GUIDE_ID,
    { blackouts, bookings: [], bufferBefore: 0, bufferAfter: 0 }
  );

  assert.equal(result.available, false);
  assert.equal(result.reason, 'BLACKOUT_CONFLICT');
});

test('validateSlotAvailability detects booking conflicts', () => {
  const futureDate = new Date(Date.now() + 86400000); // Tomorrow
  const bookings = [
    createMockBooking({
      guide_id: GUIDE_ID,
      start_at: new Date(futureDate.getTime() - 3600000).toISOString(),
      end_at: new Date(futureDate.getTime() + 3600000).toISOString(),
      status: 'confirmed',
    }),
  ];

  const result = validateSlotAvailability(
    futureDate.toISOString(),
    new Date(futureDate.getTime() + 4 * 3600000).toISOString(),
    GUIDE_ID,
    { blackouts: [], bookings, bufferBefore: 0, bufferAfter: 0 }
  );

  assert.equal(result.available, false);
  assert.equal(result.reason, 'BOOKING_CONFLICT');
});

test('validateSlotAvailability passes for available slots', () => {
  const futureDate = new Date(Date.now() + 86400000); // Tomorrow

  const result = validateSlotAvailability(
    futureDate.toISOString(),
    new Date(futureDate.getTime() + 4 * 3600000).toISOString(),
    GUIDE_ID,
    { blackouts: [], bookings: [], bufferBefore: 0, bufferAfter: 0 }
  );

  assert.equal(result.available, true);
  assert.equal(result.reason, undefined);
});

// ============================================================================
// Edge Cases
// ============================================================================

test('handles empty rules gracefully', () => {
  const plan = createMockPlan();

  const input = {
    guideId: GUIDE_ID,
    activityPlanId: PLAN_ID,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-20',
    timezone: TIMEZONE_TAIPEI,
  };

  const result = generateAvailableSlots(input, { rules: [], blackouts: [], bookings: [], plan });

  assert.equal(result.slots.length, 0);
});

test('handles overlapping blackouts correctly', () => {
  const rules = [
    createMockRule({
      weekday: 1,
      start_time_local: '09:00',
      end_time_local: '17:00',
      slot_interval_minutes: 240,
    }),
  ];

  const blackouts = [
    createMockBlackout({
      id: 'b1',
      starts_at: '2026-04-20T01:00:00Z',
      ends_at: '2026-04-20T03:00:00Z',
    }),
    createMockBlackout({
      id: 'b2',
      starts_at: '2026-04-20T02:00:00Z',
      ends_at: '2026-04-20T04:00:00Z',
    }),
  ];

  const plan = createMockPlan({ duration_minutes: 240 });

  const input = {
    guideId: GUIDE_ID,
    activityPlanId: PLAN_ID,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-20',
    timezone: TIMEZONE_TAIPEI,
  };

  const result = generateAvailableSlots(input, { rules, blackouts, bookings: [], plan });

  // Both 09:00 and 13:00 slots should be blocked due to overlapping blackouts
  // Actually, 09:00-13:00 overlaps with both blackouts
  // 13:00-17:00 doesn't overlap
  assert.equal(result.slots.length, 1);
});

test('handles back-to-back bookings with buffers', () => {
  const rules = [
    createMockRule({
      weekday: 1,
      start_time_local: '09:00',
      end_time_local: '18:00',
      slot_interval_minutes: 60,
      buffer_before_minutes: 30,
      buffer_after_minutes: 30,
    }),
  ];

  const bookings = [
    createMockBooking({
      start_at: '2026-04-20T03:00:00Z', // 11:00 Taipei
      end_at: '2026-04-20T05:00:00Z', // 13:00 Taipei
    }),
  ];

  const plan = createMockPlan({ duration_minutes: 120 }); // 2-hour slots

  const input = {
    guideId: GUIDE_ID,
    activityPlanId: PLAN_ID,
    dateFrom: '2026-04-20',
    dateTo: '2026-04-20',
    timezone: TIMEZONE_TAIPEI,
  };

  const result = generateAvailableSlots(input, { rules, blackouts: [], bookings, plan });

  // Available windows:
  // - Before booking: 09:00-10:30 (with 30-min buffer before 11:00)
  //   - 09:00-11:00 slot would conflict (ends 30 min before booking but booking needs 30 min buffer)
  // - After booking: 13:30-18:00 (with 30-min buffer after 13:00)
  //   - 13:00-15:00 slot would conflict (starts when booking ends, needs 30 min buffer)
  //   - 13:30-15:30 would be first available

  // The slots that should be available are limited by buffers
  result.slots.forEach((slot) => {
    const startTime = new Date(slot.startAt);
    const endTime = new Date(slot.endAt);
    // Ensure no slot overlaps with booking + buffers
    const bookingStart = new Date('2026-04-20T03:00:00Z');
    const bookingEnd = new Date('2026-04-20T05:00:00Z');
    const bufferStart = addMinutes(bookingStart, -30);
    const bufferEnd = addMinutes(bookingEnd, 30);

    assert.ok(!rangesOverlap(startTime, endTime, bufferStart, bufferEnd));
  });
});

console.log('All slot generator tests completed!');
