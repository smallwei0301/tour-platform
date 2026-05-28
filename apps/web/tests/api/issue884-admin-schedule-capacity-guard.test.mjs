/**
 * Tests for Issue #891 (leaf of #884 AC4):
 * Admin schedule create/update must block capacity > plan.max_participants.
 *
 * Strategy:
 * - Unit tests for validateScheduleCapacityAgainstPlan() with mock Supabase injection.
 * - Source contract tests for admin routes (POST /api/admin/activities/:id/schedules
 *   and PUT /api/admin/schedules/:scheduleId) to verify the 422 guard is wired.
 * - Source contract test for db.mjs to verify the guard is present in both create/update.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { validateScheduleCapacityAgainstPlan } from '../../src/lib/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function readSrc(relPath) {
  return readFileSync(path.join(ROOT, relPath), 'utf8');
}

// ── Supabase mock (same pattern as issue880 / issue882) ───────────────────────

function createSupabaseMock(results) {
  let index = 0;
  const take = (terminal, table) => {
    const next = results[index++];
    assert.ok(next !== undefined, `unexpected query: ${terminal} on ${table} (already consumed ${index - 1} of ${results.length})`);
    return { data: next.data ?? null, error: next.error ?? null };
  };
  class Query {
    constructor(table) { this.table = table; this._filters = []; }
    select()           { return this; }
    eq(c, v)           { this._filters.push(['eq', c, v]); return this; }
    maybeSingle()      { return Promise.resolve(take('maybeSingle', this.table)); }
    single()           { return Promise.resolve(take('single', this.table)); }
    // Non-single query used by validateScheduleCapacityAgainstPlan for null-planId path
    then(resolve, reject) { return Promise.resolve(take('then', this.table)).then(resolve, reject); }
  }
  return {
    client: { from(table) { return new Query(table); } },
    assertAllConsumed() { assert.equal(index, results.length, `expected ${results.length} queries, consumed ${index}`); },
  };
}

const ACTIVITY = 'aaaa0000-0000-4000-8000-000000000001';
const PLAN_ID  = 'bbbb0000-0000-4000-8000-000000000002';

// ── Unit tests: validateScheduleCapacityAgainstPlan ───────────────────────────

test('#891 validateScheduleCapacityAgainstPlan: capacity > planId.max → not ok', async () => {
  const mock = createSupabaseMock([
    { data: { max_participants: 8 } },
  ]);
  const result = await validateScheduleCapacityAgainstPlan({
    supabase: mock.client,
    activityId: ACTIVITY,
    planId: PLAN_ID,
    capacity: 10,
  });
  assert.equal(result.ok, false, 'capacity(10) > max(8) must fail');
  assert.equal(result.blocker.code, 'SCHEDULE_CAPACITY_EXCEEDS_PLAN');
  assert.match(result.blocker.messageZh, /10/, 'messageZh includes capacity');
  assert.match(result.blocker.messageZh, /8/, 'messageZh includes plan max');
  mock.assertAllConsumed();
});

test('#891 validateScheduleCapacityAgainstPlan: capacity = planId.max → ok', async () => {
  const mock = createSupabaseMock([
    { data: { max_participants: 10 } },
  ]);
  const result = await validateScheduleCapacityAgainstPlan({
    supabase: mock.client,
    activityId: ACTIVITY,
    planId: PLAN_ID,
    capacity: 10,
  });
  assert.equal(result.ok, true, 'capacity(10) = max(10) must pass');
  mock.assertAllConsumed();
});

test('#891 validateScheduleCapacityAgainstPlan: capacity < planId.max → ok', async () => {
  const mock = createSupabaseMock([
    { data: { max_participants: 15 } },
  ]);
  const result = await validateScheduleCapacityAgainstPlan({
    supabase: mock.client,
    activityId: ACTIVITY,
    planId: PLAN_ID,
    capacity: 8,
  });
  assert.equal(result.ok, true, 'capacity(8) < max(15) must pass');
  mock.assertAllConsumed();
});

test('#891 validateScheduleCapacityAgainstPlan: planId not found → ok (don\'t block)', async () => {
  const mock = createSupabaseMock([
    { data: null },
  ]);
  const result = await validateScheduleCapacityAgainstPlan({
    supabase: mock.client,
    activityId: ACTIVITY,
    planId: PLAN_ID,
    capacity: 999,
  });
  assert.equal(result.ok, true, 'plan not found must not block write');
  mock.assertAllConsumed();
});

test('#891 validateScheduleCapacityAgainstPlan: planId=null + exactly 1 active plan + capacity too high → not ok', async () => {
  // Query returns array (non-single), so we mock the "then" terminal
  const mock = createSupabaseMock([
    { data: [{ max_participants: 6 }] },
  ]);
  const result = await validateScheduleCapacityAgainstPlan({
    supabase: mock.client,
    activityId: ACTIVITY,
    planId: null,
    capacity: 9,
  });
  assert.equal(result.ok, false, 'capacity(9) > single active plan max(6) must fail');
  assert.equal(result.blocker.code, 'SCHEDULE_CAPACITY_EXCEEDS_PLAN');
  mock.assertAllConsumed();
});

test('#891 validateScheduleCapacityAgainstPlan: planId=null + 2 active plans + capacity high → ok (ambiguous, don\'t block)', async () => {
  const mock = createSupabaseMock([
    { data: [{ max_participants: 4 }, { max_participants: 8 }] },
  ]);
  const result = await validateScheduleCapacityAgainstPlan({
    supabase: mock.client,
    activityId: ACTIVITY,
    planId: null,
    capacity: 100,
  });
  assert.equal(result.ok, true, '2 active plans is ambiguous — must not block');
  mock.assertAllConsumed();
});

test('#891 validateScheduleCapacityAgainstPlan: planId=null + 0 active plans + capacity high → ok (no plan to check)', async () => {
  const mock = createSupabaseMock([
    { data: [] },
  ]);
  const result = await validateScheduleCapacityAgainstPlan({
    supabase: mock.client,
    activityId: ACTIVITY,
    planId: null,
    capacity: 100,
  });
  assert.equal(result.ok, true, '0 active plans — no constraint to apply');
  mock.assertAllConsumed();
});

test('#891 validateScheduleCapacityAgainstPlan: planId=null + DB error → ok (fail-open)', async () => {
  const mock = createSupabaseMock([
    { data: null, error: { message: 'connection refused' } },
  ]);
  const result = await validateScheduleCapacityAgainstPlan({
    supabase: mock.client,
    activityId: ACTIVITY,
    planId: null,
    capacity: 50,
  });
  assert.equal(result.ok, true, 'DB error must fail-open (don\'t block write)');
  mock.assertAllConsumed();
});

test('#891 validateScheduleCapacityAgainstPlan: no activityId and no planId → ok (no context)', async () => {
  const mock = createSupabaseMock([]);
  const result = await validateScheduleCapacityAgainstPlan({
    supabase: mock.client,
    activityId: null,
    planId: null,
    capacity: 99,
  });
  assert.equal(result.ok, true, 'no context → no check → must pass');
  mock.assertAllConsumed();
});

// ── Source contract: db.mjs has the guard in create and update ────────────────

test('#891 db.mjs source: createScheduleDb calls validateScheduleCapacityAgainstPlan before insert', () => {
  const src = readSrc('src/lib/db.mjs');
  // Function must be exported
  assert.match(src, /export\s+async\s+function\s+validateScheduleCapacityAgainstPlan\s*\(/,
    'validateScheduleCapacityAgainstPlan must be exported');
  // createScheduleDb must call the validator
  const createFnMatch = src.match(/export\s+async\s+function\s+createScheduleDb[\s\S]*?export\s+async\s+function\s+updateScheduleDb/);
  assert.ok(createFnMatch, 'createScheduleDb function body must be found');
  assert.match(createFnMatch[0], /validateScheduleCapacityAgainstPlan/,
    'createScheduleDb must call validateScheduleCapacityAgainstPlan');
  assert.match(createFnMatch[0], /SCHEDULE_CAPACITY_EXCEEDS_PLAN/,
    'createScheduleDb must throw SCHEDULE_CAPACITY_EXCEEDS_PLAN on violation');
});

test('#891 db.mjs source: updateScheduleDb calls validateScheduleCapacityAgainstPlan before update', () => {
  const src = readSrc('src/lib/db.mjs');
  const updateFnMatch = src.match(/export\s+async\s+function\s+updateScheduleDb[\s\S]*?export\s+async\s+function\s+deleteScheduleDb/);
  assert.ok(updateFnMatch, 'updateScheduleDb function body must be found');
  assert.match(updateFnMatch[0], /validateScheduleCapacityAgainstPlan/,
    'updateScheduleDb must call validateScheduleCapacityAgainstPlan');
  assert.match(updateFnMatch[0], /SCHEDULE_CAPACITY_EXCEEDS_PLAN/,
    'updateScheduleDb must throw SCHEDULE_CAPACITY_EXCEEDS_PLAN on violation');
});

// ── Source contract: admin POST route catches SCHEDULE_CAPACITY_EXCEEDS_PLAN ──

test('#891 POST /api/admin/activities/:id/schedules: returns 422 on capacity guard violation', () => {
  const src = readSrc('app/api/admin/activities/[id]/schedules/route.ts');
  assert.match(src, /SCHEDULE_CAPACITY_EXCEEDS_PLAN/,
    'POST route must handle SCHEDULE_CAPACITY_EXCEEDS_PLAN');
  assert.match(src, /422/,
    'POST route must respond with 422 status');
  assert.match(src, /err\.code\s*===\s*['"]SCHEDULE_CAPACITY_EXCEEDS_PLAN['"]/,
    'POST route must check err.code === SCHEDULE_CAPACITY_EXCEEDS_PLAN');
});

// ── Source contract: admin PUT route catches SCHEDULE_CAPACITY_EXCEEDS_PLAN ───

test('#891 PUT /api/admin/schedules/:scheduleId: returns 422 on capacity guard violation', () => {
  const src = readSrc('app/api/admin/schedules/[scheduleId]/route.ts');
  assert.match(src, /SCHEDULE_CAPACITY_EXCEEDS_PLAN/,
    'PUT route must handle SCHEDULE_CAPACITY_EXCEEDS_PLAN');
  assert.match(src, /422/,
    'PUT route must respond with 422 status');
  assert.match(src, /err\.code\s*===\s*['"]SCHEDULE_CAPACITY_EXCEEDS_PLAN['"]/,
    'PUT route must check err.code === SCHEDULE_CAPACITY_EXCEEDS_PLAN');
});
