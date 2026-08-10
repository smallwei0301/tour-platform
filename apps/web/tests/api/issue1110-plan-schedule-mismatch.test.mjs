import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkPlanScheduleDurationMismatch } from '../../src/lib/availability-v2/plan-schedule-mismatch.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ISSUE1811_MIGRATION = join(
  REPO_ROOT,
  '..',
  '..',
  'supabase/migrations/20260810033421_issue1811_atomic_booking_order_materialization.sql',
);

const PLAN_7H = { id: 'plan-b', duration_minutes: 420 };
const PLAN_5_75H = { id: 'plan-a', duration_minutes: 345 };

const SCHEDULE_5_75H_NULL_PLAN = {
  id: 'sch-1',
  plan_id: null,
  start_at: '2026-06-03T01:00:00Z',
  end_at: '2026-06-03T06:45:00Z',
};

const SCHEDULE_7H_NULL_PLAN = {
  id: 'sch-2',
  plan_id: null,
  start_at: '2026-06-03T01:00:00Z',
  end_at: '2026-06-03T08:00:00Z',
};

test('plan_id IS NULL + 5.75h schedule vs 7h plan → PLAN_SCHEDULE_MISMATCH', () => {
  const result = checkPlanScheduleDurationMismatch(PLAN_7H, SCHEDULE_5_75H_NULL_PLAN);
  assert.equal(result?.reasonCode, 'PLAN_SCHEDULE_MISMATCH');
  assert.match(result.messageZh, /所選方案的時長/);
  assert.match(result.messageZh, /420/);
  assert.match(result.messageZh, /345/);
  assert.match(result.messageZh, /場次/);
});

test('plan_id IS NULL + 7h schedule vs 7h plan → null (match)', () => {
  assert.equal(checkPlanScheduleDurationMismatch(PLAN_7H, SCHEDULE_7H_NULL_PLAN), null);
});

test('schedule.plan_id IS NOT NULL → null (existing planMatches handles this path)', () => {
  const sch = { ...SCHEDULE_5_75H_NULL_PLAN, plan_id: 'some-uuid' };
  assert.equal(checkPlanScheduleDurationMismatch(PLAN_7H, sch), null);
});

test('within 5-minute tolerance → null', () => {
  const sch = {
    plan_id: null,
    start_at: '2026-06-03T01:00:00Z',
    end_at: '2026-06-03T08:03:00Z',
  };
  assert.equal(checkPlanScheduleDurationMismatch(PLAN_7H, sch), null);
});

test('outside 5-minute tolerance → PLAN_SCHEDULE_MISMATCH', () => {
  const sch = {
    plan_id: null,
    start_at: '2026-06-03T01:00:00Z',
    end_at: '2026-06-03T08:06:00Z',
  };
  const result = checkPlanScheduleDurationMismatch(PLAN_7H, sch);
  assert.equal(result?.reasonCode, 'PLAN_SCHEDULE_MISMATCH');
});

test('plan with missing/invalid duration_minutes → null', () => {
  assert.equal(checkPlanScheduleDurationMismatch({}, SCHEDULE_5_75H_NULL_PLAN), null);
  assert.equal(checkPlanScheduleDurationMismatch({ duration_minutes: 0 }, SCHEDULE_5_75H_NULL_PLAN), null);
  assert.equal(checkPlanScheduleDurationMismatch({ duration_minutes: -10 }, SCHEDULE_5_75H_NULL_PLAN), null);
  assert.equal(checkPlanScheduleDurationMismatch({ duration_minutes: 'foo' }, SCHEDULE_5_75H_NULL_PLAN), null);
  assert.equal(checkPlanScheduleDurationMismatch(null, SCHEDULE_5_75H_NULL_PLAN), null);
});

test('schedule.end_at <= start_at → null (degenerate window)', () => {
  const sch = { plan_id: null, start_at: '2026-06-03T08:00:00Z', end_at: '2026-06-03T01:00:00Z' };
  assert.equal(checkPlanScheduleDurationMismatch(PLAN_7H, sch), null);
});

test('schedule null/undefined → null', () => {
  assert.equal(checkPlanScheduleDurationMismatch(PLAN_7H, null), null);
  assert.equal(checkPlanScheduleDurationMismatch(PLAN_7H, undefined), null);
});

test('toleranceMinutes: 0 → strict comparison rejects 1-minute drift', () => {
  const sch = {
    plan_id: null,
    start_at: '2026-06-03T01:00:00Z',
    end_at: '2026-06-03T08:01:00Z',
  };
  const result = checkPlanScheduleDurationMismatch(PLAN_7H, sch, { toleranceMinutes: 0 });
  assert.equal(result?.reasonCode, 'PLAN_SCHEDULE_MISMATCH');
});

test('schedule.start_at unparseable → null', () => {
  const sch = { plan_id: null, start_at: 'not-a-date', end_at: '2026-06-03T06:45:00Z' };
  assert.equal(checkPlanScheduleDurationMismatch(PLAN_7H, sch), null);
});

test('Source contract: draft route imports plan-schedule-mismatch helper', () => {
  const src = readFileSync(join(REPO_ROOT, 'app/api/v2/bookings/draft/route.ts'), 'utf8');
  assert.match(
    src,
    /from\s+['"][^'"]*plan-schedule-mismatch(\.mjs)?['"]/,
    'draft route should import plan-schedule-mismatch helper',
  );
  assert.match(src, /checkPlanScheduleDurationMismatch/);
});

test('Source contract: draft route calls helper before atomic materialization and rejects with 422', () => {
  const src = readFileSync(join(REPO_ROOT, 'app/api/v2/bookings/draft/route.ts'), 'utf8');
  const callIdx = src.indexOf('checkPlanScheduleDurationMismatch(');
  const materializeIdx = src.indexOf('materializeDraftBookingOrder({');
  assert.ok(callIdx >= 0, 'route should call checkPlanScheduleDurationMismatch');
  assert.ok(materializeIdx >= 0, 'route should materialize the atomic booking/order after the guard');
  assert.ok(
    callIdx < materializeIdx,
    'checkPlanScheduleDurationMismatch must be called before atomic materialization',
  );
  const guardBlock = src.slice(callIdx, callIdx + 600);
  assert.match(guardBlock, /status:\s*422/, 'mismatch should return HTTP 422');
});

test('Source contract: helper emits PLAN_SCHEDULE_MISMATCH reasonCode literal', () => {
  const helperSrc = readFileSync(
    join(REPO_ROOT, 'src/lib/availability-v2/plan-schedule-mismatch.mjs'),
    'utf8',
  );
  assert.match(helperSrc, /reasonCode:\s*['"]PLAN_SCHEDULE_MISMATCH['"]/);
});

test('Source contract: atomic order_items insert keeps booking_id wiring (Bug B out of scope)', () => {
  // #1110 issue body lists order_items 0 rows as a separate bug. Subagent verified
  // migration 20260425093000 added the column, source already inserts it, and
  // v2-route-contract-smoke.test.mjs:40 locks the source. The "0 rows" symptom on
  // staging is an environment / migration apply problem, not a code bug. This
  // test guards the source contract so a future refactor doesn't silently regress.
  const migration = readFileSync(ISSUE1811_MIGRATION, 'utf8');
  assert.match(migration, /INSERT INTO public\.order_items\s*\([\s\S]*?\bbooking_id\b[\s\S]*?\)\s*VALUES\s*\([\s\S]*?\bv_booking_id\b/);
});
