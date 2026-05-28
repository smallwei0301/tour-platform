/**
 * #839 — getPlanScheduleForDate: plan-ID mismatch defense.
 *
 * Bug: V2 availability returns planId as UUID (activity_plans.id) while UI
 * plan cards use legacy slugs ('half-day', 'full-day'). getPlanScheduleForDate
 * found no match (UUID ≠ slug, neither is null) → returned isNotOpen:true even
 * when the schedule data said the date was open.
 *
 * Fix: the function now accepts knownPlanIds. When no schedules match the
 * requested planId, but all schedule planIds are non-null and foreign to the
 * known plan ID space (e.g., all UUIDs), the function falls back to date-level
 * aggregation (ignoring planId) so that open dates are not grayed out.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const { getPlanScheduleForDate } = await import(
  path.join(ROOT, 'src/components/activity/plan-schedule-match.ts')
);

const TODAY    = '2026-05-28';
const TOMORROW = '2026-05-29';
const PLAN_A = 'half-day';
const PLAN_B = 'full-day';
const UUID_A = 'cccccccc-0000-0000-0000-000000000001';
const UUID_B = 'cccccccc-0000-0000-0000-000000000002';

function makeSchedule(overrides = {}) {
  return {
    startAt: `${TODAY}T09:00:00+08:00`,
    capacity: 10,
    bookedCount: 0,
    status: 'open',
    planId: null,
    ...overrides,
  };
}

// ── 1. Backwards-compatible: planId null applies to all plans ─────────────────
describe('#839 — getPlanScheduleForDate: planId:null schedule applies to all plans', () => {
  it('planId:null open schedule → isOpen:true for any target planId', () => {
    const schedules = [makeSchedule({ planId: null, status: 'open' })];
    const r = getPlanScheduleForDate(schedules, TODAY, PLAN_A);
    assert.equal(r.isOpen, true);
    assert.equal(r.isNotOpen, false);
  });

  it('planId:null not-open schedule → isNotOpen:true', () => {
    const schedules = [makeSchedule({ planId: null, status: 'not-open' })];
    const r = getPlanScheduleForDate(schedules, TODAY, PLAN_A);
    assert.equal(r.isNotOpen, true);
    assert.equal(r.isOpen, false);
  });
});

// ── 2. Backwards-compatible: matching legacy slug planId ─────────────────────
describe('#839 — getPlanScheduleForDate: matching legacy slug', () => {
  it('planId:half-day open → isOpen:true for PLAN_A', () => {
    const schedules = [makeSchedule({ planId: PLAN_A, status: 'open' })];
    const r = getPlanScheduleForDate(schedules, TODAY, PLAN_A);
    assert.equal(r.isOpen, true);
  });

  it('planId:half-day not-open → isNotOpen:true (real not-open preserved)', () => {
    const schedules = [makeSchedule({ planId: PLAN_A, status: 'not-open', bookedCount: 10 })];
    const r = getPlanScheduleForDate(schedules, TODAY, PLAN_A);
    assert.equal(r.isNotOpen, true);
    assert.equal(r.isOpen, false);
  });

  it('planId:full-day does not match PLAN_A (normal exclusion)', () => {
    // PLAN_B matches PLAN_B's schedule but not PLAN_A; PLAN_B is in knownPlanIds
    // so the UUID-fallback path should NOT activate.
    const schedules = [makeSchedule({ planId: PLAN_B, status: 'open' })];
    const r = getPlanScheduleForDate(schedules, TODAY, PLAN_A, [PLAN_A, PLAN_B]);
    // PLAN_B planId IS in knownPlanIds → this is normal plan exclusion (not UUID space)
    // So the result should be isNotOpen:true (correct: PLAN_A has no slot on this date)
    assert.equal(r.isNotOpen, true);
  });
});

// ── 3. Bug repro: UUID planIds from V2 ───────────────────────────────────────
describe('#839 — getPlanScheduleForDate: UUID planIds from V2 (bug repro)', () => {
  it('schedules with UUID planIds, target is legacy slug, no knownPlanIds → old bug: isNotOpen:true', () => {
    // This test documents the OLD (pre-fix) behavior when knownPlanIds is not passed.
    // Without knownPlanIds, the function has no way to detect UUID space, so it
    // falls through to "no match → isNotOpen:true". We verify this is still the
    // old default (knownPlanIds=[]) so the fix is opt-in.
    const schedules = [
      makeSchedule({ planId: UUID_A, status: 'open', startAt: `${TODAY}T09:00:00+08:00` }),
      makeSchedule({ planId: UUID_B, status: 'open', startAt: `${TODAY}T13:00:00+08:00` }),
    ];
    const r = getPlanScheduleForDate(schedules, TODAY, PLAN_A);
    // Old behavior: no slug match, UUID is not null → isNotOpen:true
    assert.equal(r.isNotOpen, true, 'without knownPlanIds, UUID mismatch should still be isNotOpen (opt-in defense)');
  });

  it('schedules with UUID planIds, all open, target=half-day, knownPlanIds=[half-day,full-day] → isOpen:true (fix)', () => {
    // THE FIX: all schedule planIds are non-null and foreign to knownPlanIds
    // → date-level fallback: date has open capacity, so isOpen:true
    const schedules = [
      makeSchedule({ planId: UUID_A, status: 'open', startAt: `${TODAY}T09:00:00+08:00` }),
      makeSchedule({ planId: UUID_B, status: 'open', startAt: `${TODAY}T13:00:00+08:00` }),
    ];
    const r = getPlanScheduleForDate(schedules, TODAY, PLAN_A, [PLAN_A, PLAN_B]);
    assert.equal(r.isOpen, true, 'with knownPlanIds, open UUID schedules should show as isOpen:true');
    assert.equal(r.isNotOpen, false);
  });

  it('UUID planIds present but status:not-open → isNotOpen:true preserved (no false positives)', () => {
    const schedules = [
      makeSchedule({ planId: UUID_A, status: 'not-open', bookedCount: 10, startAt: `${TODAY}T09:00:00+08:00` }),
      makeSchedule({ planId: UUID_B, status: 'not-open', bookedCount: 8, startAt: `${TODAY}T13:00:00+08:00` }),
    ];
    const r = getPlanScheduleForDate(schedules, TODAY, PLAN_A, [PLAN_A, PLAN_B]);
    assert.equal(r.isNotOpen, true, 'UUID schedules that are truly not-open must stay not-open');
  });

  it('UUID schedules on a different date → isNotOpen:true for target date (no cross-date pollution)', () => {
    const schedules = [
      makeSchedule({ planId: UUID_A, status: 'open', startAt: `${TOMORROW}T09:00:00+08:00` }),
    ];
    const r = getPlanScheduleForDate(schedules, TODAY, PLAN_A, [PLAN_A, PLAN_B]);
    assert.equal(r.isNotOpen, true, 'schedules from a different date must not affect the target date');
  });
});

// ── 4. No schedules for target date ──────────────────────────────────────────
describe('#839 — getPlanScheduleForDate: no schedule for date', () => {
  it('completely empty schedules → isNotOpen:true', () => {
    const r = getPlanScheduleForDate([], TODAY, PLAN_A);
    assert.equal(r.isNotOpen, true);
  });

  it('schedule exists for a different date → isNotOpen:true for today', () => {
    const schedules = [makeSchedule({ startAt: `${TOMORROW}T09:00:00+08:00`, planId: null, status: 'open' })];
    const r = getPlanScheduleForDate(schedules, TODAY, PLAN_A);
    assert.equal(r.isNotOpen, true);
  });
});

// ── 5. DatePlanSection.tsx wiring: imports plan-schedule-match ────────────────
describe('#839 — DatePlanSection.tsx wiring', () => {
  it('DatePlanSection.tsx imports getPlanScheduleForDate from plan-schedule-match', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(
      path.join(ROOT, 'src/components/activity/DatePlanSection.tsx'),
      'utf8'
    );
    assert.match(src, /plan-schedule-match/, 'DatePlanSection must import from plan-schedule-match');
    assert.match(src, /knownPlanIds/, 'DatePlanSection must pass knownPlanIds to getPlanScheduleForDate');
  });
});
