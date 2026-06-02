// Issue #1115 — PR #1114 silently skipped: activity_schedules SELECT was missing
// end_at, so schedule.end_at was undefined, Date.parse(undefined) === NaN, and
// checkPlanScheduleDurationMismatch unconditionally returned null. Every (plan,
// schedule) pair passed the guard regardless of duration delta.
//
// These regression tests pin the SELECT shape + the type declarations so a
// future refactor cannot drop end_at again, and they also document the
// upstream contract that the helper depends on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkPlanScheduleDurationMismatch } from '../../src/lib/availability-v2/plan-schedule-mismatch.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const ROUTE_SRC = readFileSync(
  join(REPO_ROOT, 'app/api/v2/bookings/draft/route.ts'),
  'utf8',
);
const SELECTED_SCHEDULE_SRC = readFileSync(
  join(REPO_ROOT, 'src/lib/booking-v2-selected-schedule.ts'),
  'utf8',
);

test('Issue #1115: every activity_schedules SELECT in the draft route includes end_at', () => {
  const selectsAfterActivitySchedules = ROUTE_SRC.split("from('activity_schedules')").slice(1);
  assert.ok(
    selectsAfterActivitySchedules.length >= 2,
    'expected at least 2 activity_schedules query sites (primary + fallback) in draft route',
  );
  selectsAfterActivitySchedules.forEach((block, idx) => {
    const selectMatch = block.match(/\.select\(\s*['"`]([^'"`]+)['"`]/);
    assert.ok(selectMatch, `activity_schedules query #${idx + 1} should call .select(...)`);
    const columnList = selectMatch[1];
    assert.match(
      columnList,
      /\bend_at\b/,
      `activity_schedules query #${idx + 1} must include end_at column; got: ${columnList}`,
    );
  });
});

test('Issue #1115: ActivitySchedule type in draft route declares end_at', () => {
  const typeBlock = ROUTE_SRC.split('type ActivitySchedule')[1]?.split('};')[0] || '';
  assert.match(
    typeBlock,
    /end_at\s*:\s*string/,
    'ActivitySchedule type should declare end_at: string',
  );
});

test('Issue #1115: DraftScheduleRow shared type declares end_at', () => {
  const typeBlock = SELECTED_SCHEDULE_SRC.split('export type DraftScheduleRow')[1]?.split('};')[0] || '';
  assert.match(
    typeBlock,
    /end_at\s*:\s*string/,
    'DraftScheduleRow type should declare end_at: string',
  );
});

test('Issue #1115: helper returns null for undefined end_at — documents the silent-fail vector the SELECT must protect against', () => {
  // This is intentionally a behavioral regression note. If end_at is dropped
  // from the activity_schedules SELECT (the root cause of #1115), the helper
  // silently returns null and lets every booking through. The first three
  // tests above guard the SELECT; this test pins the helper's safe-fail
  // semantics so the relationship is explicit.
  const planB = { id: 'plan-b', duration_minutes: 420 };
  const scheduleMissingEndAt = {
    plan_id: null,
    start_at: '2026-06-03T01:00:00Z',
    // end_at intentionally omitted
  };
  assert.equal(checkPlanScheduleDurationMismatch(planB, scheduleMissingEndAt), null);
});

test('Issue #1115: with end_at present, the 240min vs 420min repro from the issue is rejected', () => {
  // Live repro from issue body: schedule 240min (01:00 → 05:00 UTC) vs Plan B
  // 420min, plan_id IS NULL. Must produce PLAN_SCHEDULE_MISMATCH once end_at
  // flows through the SELECT.
  const planB = { id: 'plan-b', duration_minutes: 420 };
  const scheduleWithRealEndAt = {
    plan_id: null,
    start_at: '2026-06-03T01:00:00Z',
    end_at: '2026-06-03T05:00:00Z',
  };
  const result = checkPlanScheduleDurationMismatch(planB, scheduleWithRealEndAt);
  assert.equal(result?.reasonCode, 'PLAN_SCHEDULE_MISMATCH');
  assert.match(result.messageZh, /240/);
  assert.match(result.messageZh, /420/);
});
