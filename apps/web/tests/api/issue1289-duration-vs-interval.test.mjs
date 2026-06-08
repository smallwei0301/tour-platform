/**
 * GH-1289: duration-vs-interval correctness tests
 *
 * These tests verify that slot generation correctly distinguishes:
 *   - duration_minutes: how long a slot lasts (slotEnd = slotStart + duration)
 *   - slot_interval_minutes: cadence between slot starts
 *
 * RED: must fail before the fix (availability-preview/route.ts hand-rolled loop
 *      uses interval as duration, never reads plan.duration_minutes)
 * GREEN: must pass after canonical generator is wired in
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCandidateSlots,
  generateAvailableSlots,
} from '../../src/lib/slot-generator.ts';

const GUIDE_ID = 'guide-1289';
const PLAN_ID = 'plan-1289';
const TIMEZONE = 'Asia/Taipei';

function makeRule(overrides = {}) {
  return {
    id: 'rule-1289',
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
    activity_id: 'activity-1289',
    duration_minutes: 90,
    max_participants: 10,
    booking_type: 'scheduled',
    ...overrides,
  };
}

// ============================================================================
// Test 1: When duration != interval, slotEnd must = slotStart + duration
//         NOT slotStart + interval
// ============================================================================
test('duration 90min with interval 60min: slotEnd = slotStart + 90min, NOT + 60min', () => {
  const rule = makeRule({ slot_interval_minutes: 60 });
  const plan = makePlan({ duration_minutes: 90 });

  // buildCandidateSlots(rule, durationMinutes, dateStr)
  // date: 2026-06-09 (Monday)
  const candidates = buildCandidateSlots(rule, plan.duration_minutes, '2026-06-09');

  assert.ok(candidates.length > 0, 'Should generate candidates');

  // Verify each slot spans exactly duration_minutes (90), not interval (60)
  for (const slot of candidates) {
    const spanMs = slot.endAt.getTime() - slot.startAt.getTime();
    const spanMin = spanMs / 60000;
    assert.strictEqual(
      spanMin,
      90,
      `Slot ${slot.startAt.toISOString()} must span 90 min (got ${spanMin})`
    );
  }
});

// ============================================================================
// Test 2: Cadence is governed by slot_interval_minutes, not duration_minutes
//         i.e., consecutive slot starts differ by interval, not duration
// ============================================================================
test('slot starts are spaced by slot_interval_minutes (60), not duration_minutes (90)', () => {
  const rule = makeRule({ slot_interval_minutes: 60 });
  const plan = makePlan({ duration_minutes: 90 });

  const candidates = buildCandidateSlots(rule, plan.duration_minutes, '2026-06-09');
  assert.ok(candidates.length >= 2, 'Need at least 2 slots to check cadence');

  // Consecutive start times must differ by interval (60 min), not duration (90 min)
  for (let i = 1; i < candidates.length; i++) {
    const diffMs = candidates[i].startAt.getTime() - candidates[i - 1].startAt.getTime();
    const diffMin = diffMs / 60000;
    assert.strictEqual(
      diffMin,
      60,
      `Slot starts must be 60min apart (got ${diffMin}min between slots ${i - 1} and ${i})`
    );
  }
});

// ============================================================================
// Test 3: Slots whose end would exceed the rule window are NOT emitted
//         With duration=90min and rule end=18:00, the last valid start is 16:30
// ============================================================================
test('no slot is emitted whose slotEnd exceeds the rule window', () => {
  const rule = makeRule({
    slot_interval_minutes: 60,
    start_time_local: '09:00',
    end_time_local: '18:00',
  });
  const plan = makePlan({ duration_minutes: 90 });

  const candidates = buildCandidateSlots(rule, plan.duration_minutes, '2026-06-09');
  assert.ok(candidates.length > 0, 'Should generate candidates');

  // Parse rule window end in Asia/Taipei
  const ruleWindowEnd = new Date('2026-06-09T18:00:00+08:00');

  for (const slot of candidates) {
    assert.ok(
      slot.endAt <= ruleWindowEnd,
      `Slot ending at ${slot.endAt.toISOString()} exceeds rule window end ${ruleWindowEnd.toISOString()}`
    );
  }
});

// ============================================================================
// Test 4: generateAvailableSlots uses plan.duration_minutes (integration)
//         With duration=120min and interval=60min, verify slots span 120min
// ============================================================================
test('generateAvailableSlots emits slots with span = plan.duration_minutes', () => {
  const rule = makeRule({ slot_interval_minutes: 60, weekday: 1 });
  const plan = makePlan({ duration_minutes: 120 });

  // 2026-06-08 is a Monday
  const result = generateAvailableSlots(
    {
      guideId: GUIDE_ID,
      activityPlanId: PLAN_ID,
      dateFrom: '2026-06-08',
      dateTo: '2026-06-08',
      timezone: TIMEZONE,
      participants: 1,
    },
    {
      rules: [rule],
      blackouts: [],
      bookings: [],
      plan,
    }
  );

  assert.ok(result.slots.length > 0, 'Should return at least one slot');

  for (const slot of result.slots) {
    const start = new Date(slot.startAt);
    const end = new Date(slot.endAt);
    const spanMin = (end.getTime() - start.getTime()) / 60000;
    assert.strictEqual(
      spanMin,
      120,
      `Slot ${slot.startAt} → ${slot.endAt} should span 120min (got ${spanMin})`
    );
  }
});

// ============================================================================
// Test 5: When duration == interval (degenerate case), behavior is preserved
// ============================================================================
test('when duration == interval (e.g. 60/60), slots are contiguous and correct', () => {
  const rule = makeRule({ slot_interval_minutes: 60, weekday: 1 });
  const plan = makePlan({ duration_minutes: 60 });

  const candidates = buildCandidateSlots(rule, plan.duration_minutes, '2026-06-08');
  assert.ok(candidates.length > 0);

  for (const slot of candidates) {
    const spanMin = (slot.endAt.getTime() - slot.startAt.getTime()) / 60000;
    assert.strictEqual(spanMin, 60);
  }

  // Consecutive starts differ by 60min (= interval = duration in this case)
  for (let i = 1; i < candidates.length; i++) {
    const diffMin = (candidates[i].startAt.getTime() - candidates[i - 1].startAt.getTime()) / 60000;
    assert.strictEqual(diffMin, 60);
  }
});
