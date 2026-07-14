/**
 * Contract + behavioural tests for Issue #880 (focused subset: AC #2 + AC #4).
 *
 * Scope (this PR):
 * - AC #2: when planKey is a slug that cannot be resolved to an active plan,
 *   respond with 404 PLAN_NOT_FOUND (incl. details.planKey) instead of
 *   400 VALIDATION_ERROR 'Invalid planId format'. The 400 path is reserved
 *   for actual input format issues (missing planId, non-UUID for endpoints
 *   that require UUID).
 * - AC #4: capacityLeft must not exceed plan.max_participants. The slot
 *   serializer accepts an optional schedule-capacity hint and caps
 *   capacityLeft at min(plan.max_participants, scheduleCapacityHint).
 *
 * Out of scope (follow-up issues):
 * - AC #1 / #3: backfill activity_plans or rewrite public activity API
 * - AC #5: hide inactive plan CTA in public detail pages
 * - AC #6: full-site available-slots crawl regression
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { getAvailableSlots } from '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts';
import { serializeSlots } from '../../src/lib/slot-generator.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handlerPath = path.resolve(
  __dirname,
  '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts',
);
const slotGenPath = path.resolve(__dirname, '../../src/lib/slot-generator.ts');

// 日期炸彈防護：時段一旦早於現在會被 slot-generator 濾掉（slot-generator.ts:
// `if (slot.startAt < new Date())`）。需要「應回傳時段」的測試改用相對未來日期，
// 與 issue1067 測試同一 pattern。
const BOOKABLE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// ── Supabase mock (mirrors issue787 fixture pattern) ─────────────────────────

function createSupabaseMock(results) {
  let index = 0;
  const calls = [];
  const optionalThenTables = new Set(['activity_plan_seasons', 'guide_slot_conflict_overrides']);
  const take = (terminal, table, filters) => {
    const next = results[index];
    if ((!next || next.terminal !== terminal || next.table !== table) && terminal === 'then' && optionalThenTables.has(table)) {
      calls.push({ terminal, table, filters: [...filters] });
      return { data: [], error: null };
    }
    index += 1;
    assert.ok(next, `unexpected query: ${terminal} on ${table}`);
    assert.equal(next.terminal, terminal, `terminal mismatch for ${table}`);
    assert.equal(next.table, table, `table mismatch for ${terminal}`);
    calls.push({ terminal, table, filters: [...filters] });
    return { data: next.data ?? null, error: next.error ?? null };
  };
  class Query {
    constructor(table) { this.table = table; this.filters = []; }
    select() { return this; }
    eq(c, v) { this.filters.push(['eq', c, v]); return this; }
    in(c, v) { this.filters.push(['in', c, v]); return Promise.resolve(take('in', this.table, this.filters)); }
    or(v) { this.filters.push(['or', v]); return Promise.resolve(take('or', this.table, this.filters)); }
    limit(v) { this.filters.push(['limit', v]); return Promise.resolve(take('limit', this.table, this.filters)); }
    order(c, o) { this.filters.push(['order', c, o]); return this; }
    maybeSingle() { return Promise.resolve(take('maybeSingle', this.table, this.filters)); }
    single() { return Promise.resolve(take('single', this.table, this.filters)); }
    then(resolve, reject) { return Promise.resolve(take('then', this.table, this.filters)).then(resolve, reject); }
  }
  return {
    client: { from(table) { return new Query(table); } },
    calls,
    assertAllConsumed() { assert.equal(index, results.length, 'not all mocked queries were consumed'); },
  };
}

function buildRequest(url) { return { nextUrl: new URL(url) }; }

const ACTIVITY = '11111111-1111-1111-1111-111111111111';
const SCHEDULE = '22222222-2222-2222-2222-222222222222';

// ── AC #2: PLAN_NOT_FOUND (404) instead of VALIDATION_ERROR (400) ────────────

test('#880 AC2: slug with no matching active plan and no scheduleId → 404 PLAN_NOT_FOUND', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
  ]);
  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${ACTIVITY}/available-slots?planId=full-day-complete&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId: ACTIVITY }) },
    { createClient: async () => supabase.client },
  );
  assert.equal(response.status, 404, 'unresolved slug must return 404, not 400');
  const body = await response.json();
  assert.equal(body.error.code, 'PLAN_NOT_FOUND', 'stable contract code for unresolved plans');
  assert.match(body.error.message, /plan/i, 'message mentions plan');
  assert.equal(body.error.details?.planKey, 'full-day-complete', 'details echoes the slug for UI');
  assert.equal(body.error.details?.activityId, ACTIVITY, 'details echoes the activity id');
  supabase.assertAllConsumed();
});

test('available-slots: UUID planId without a formal plan returns the stable PLAN_NOT_FOUND 404 contract', async () => {
  const missingFormalPlanId = '33333333-3333-4333-8333-333333333333';
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY } },
    { terminal: 'single', table: 'activity_plans', data: null },
  ]);
  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${ACTIVITY}/available-slots?planId=${missingFormalPlanId}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId: ACTIVITY }) },
    { createClient: async () => supabase.client },
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'PLAN_NOT_FOUND');
  assert.match(body.error.message, /Activity plan not found/i);
  assert.ok(body.error.messageZh, 'traveler-safe zh-TW message is present');
  assert.doesNotMatch(JSON.stringify(body.error), /token|secret|supabase|postgres|database/i);
  supabase.assertAllConsumed();
});

test('#880 AC2: slug + scheduleId but legacy schedule row missing → 404 PLAN_NOT_FOUND', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: null },
  ]);
  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${ACTIVITY}/available-slots?planId=full-day-complete&scheduleId=${SCHEDULE}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId: ACTIVITY }) },
    { createClient: async () => supabase.client },
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error.code, 'PLAN_NOT_FOUND');
  assert.equal(body.error.details?.planKey, 'full-day-complete');
  supabase.assertAllConsumed();
});

test('#880 AC2: slug + scheduleId.plan_id null + ambiguous active plans → 200 AMBIGUOUS_PLAN success payload', async () => {
  // #882 split the previously-conflated PLAN_NOT_FOUND case into two stable
  // codes: PLAN_NOT_FOUND (404) for "no candidate exists" and AMBIGUOUS_PLAN
  // (200 success payload) for "multiple active candidates, server refuses to guess".
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: { id: SCHEDULE, plan_id: null } },
    { terminal: 'limit', table: 'activity_plans', data: [{ id: 'a' }, { id: 'b' }] },
  ]);
  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${ACTIVITY}/available-slots?planId=full-day-complete&scheduleId=${SCHEDULE}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId: ACTIVITY }) },
    { createClient: async () => supabase.client },
  );
  assert.equal(response.status, 200, 'ambiguous fallback yields success contract under #882');
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data?.reason, 'AMBIGUOUS_PLAN');
  assert.equal(body.data?.slots?.length, 0);
  assert.ok(body.data?.messageZh && body.data.messageZh.length > 0, 'must include messageZh');
  assert.match(body.data.messageZh, /重新選擇/, 'messageZh should ask users to re-select a clear plan');
  assert.equal(body.data?.planId, 'full-day-complete');
  supabase.assertAllConsumed();
});

test('#880 AC2: missing planId param still returns 400 VALIDATION_ERROR (input validation preserved)', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY } },
  ]);
  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${ACTIVITY}/available-slots?dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId: ACTIVITY }) },
    { createClient: async () => supabase.client },
  );
  assert.equal(response.status, 400, 'missing planId is a real input error');
  const body = await response.json();
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.match(body.error.message, /planId is required/);
});

// ── AC #4: capacity guard (capacityLeft ≤ plan.max_participants) ─────────────

test('#880 AC4 source: serializeSlots accepts optional schedule capacity hint param', () => {
  const src = readFileSync(slotGenPath, 'utf8');
  // The signature must accept an optional 4th/5th positional or named hint param
  // so the route handler can clamp capacityLeft at min(plan.max, schedule available).
  assert.match(
    src,
    /scheduleCapacityHint/,
    'serializeSlots must thread a scheduleCapacityHint param',
  );
});

test('#880 AC4 behavioural: hint < plan.max → capacityLeft = hint - participants', () => {
  const plan = { max_participants: 10, booking_type: 'scheduled', duration_minutes: 60 };
  const slots = [{ startAt: new Date('2026-07-01T09:00:00Z'), endAt: new Date('2026-07-01T10:00:00Z') }];
  const out = serializeSlots(slots, 'Asia/Taipei', plan, 2, 7);
  assert.equal(out[0].capacityLeft, 5, 'hint(7) is smaller cap than plan.max(10); 7 - 2 = 5');
});

test('#880 AC4 behavioural: hint > plan.max → capacityLeft = plan.max - participants', () => {
  const plan = { max_participants: 10, booking_type: 'scheduled', duration_minutes: 60 };
  const slots = [{ startAt: new Date('2026-07-01T09:00:00Z'), endAt: new Date('2026-07-01T10:00:00Z') }];
  const out = serializeSlots(slots, 'Asia/Taipei', plan, 0, 11);
  assert.equal(out[0].capacityLeft, 10, 'plan.max(10) caps the hint(11); 10 - 0 = 10');
});

test('#880 AC4 behavioural: no hint → preserves legacy plan-only math', () => {
  const plan = { max_participants: 8, booking_type: 'scheduled', duration_minutes: 60 };
  const slots = [{ startAt: new Date('2026-07-01T09:00:00Z'), endAt: new Date('2026-07-01T10:00:00Z') }];
  const out = serializeSlots(slots, 'Asia/Taipei', plan, 3);
  assert.equal(out[0].capacityLeft, 5, 'no hint = plan.max - participants (no regression)');
});

test('#880 AC4 behavioural: hint of 0 (schedule full) → capacityLeft = 0, not negative', () => {
  const plan = { max_participants: 10, booking_type: 'scheduled', duration_minutes: 60 };
  const slots = [{ startAt: new Date('2026-07-01T09:00:00Z'), endAt: new Date('2026-07-01T10:00:00Z') }];
  const out = serializeSlots(slots, 'Asia/Taipei', plan, 1, 0);
  assert.equal(out[0].capacityLeft, 0, 'sold-out schedule must clamp at 0 even with participants subtracted');
});

test('#880 AC4 route: scheduleId path with schedule.capacity > plan.max → capacityLeft caps at plan.max', async () => {
  const planUuid = '33333333-3333-4333-8333-333333333333';
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY } },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: { id: SCHEDULE, activity_id: ACTIVITY, plan_id: null, start_at: `${BOOKABLE_DATE}T09:00:00.000Z`, end_at: `${BOOKABLE_DATE}T11:00:00.000Z`, capacity: 11, booked_count: 0, status: 'open' } },
    { terminal: 'single', table: 'activity_plans', data: { id: planUuid, activity_id: ACTIVITY, duration_minutes: 120, min_participants: 1, max_participants: 10, booking_type: 'scheduled', status: 'active', is_year_round: true, activities: { id: ACTIVITY, guide_id: '44444444-4444-4444-4444-444444444444' } } },
    { terminal: 'or', table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates', data: [] },
    { terminal: 'in', table: 'bookings', data: [] },
  ]);
  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${ACTIVITY}/available-slots?planId=${planUuid}&scheduleId=${SCHEDULE}&dateFrom=${BOOKABLE_DATE}&dateTo=${BOOKABLE_DATE}&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId: ACTIVITY }) },
    { createClient: async () => supabase.client },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.selectedPlan.maxParticipants, 10);
  assert.equal(body.data.slots.length, 1);
  assert.ok(
    body.data.slots[0].capacityLeft <= 10,
    `capacityLeft (${body.data.slots[0].capacityLeft}) must not exceed plan.maxParticipants (10)`,
  );
});

// ── Source-pattern: handler exports the new error code path ──────────────────

test('#880 source: route-handler returns PLAN_NOT_FOUND for unresolved plan slugs', () => {
  const src = readFileSync(handlerPath, 'utf8');
  assert.match(src, /PLAN_NOT_FOUND/, 'handler must emit PLAN_NOT_FOUND for unresolved plans');
  // The three previously-VALIDATION_ERROR fallback paths must no longer use
  // 'Invalid planId format' as their only failure mode (it's still legal for
  // strict input validation but not for slug-not-found).
  const occurrences = (src.match(/['"]Invalid planId format['"]/g) || []).length;
  assert.ok(
    occurrences <= 1,
    `'Invalid planId format' literal should appear at most once (strict-format guard only); found ${occurrences}`,
  );
});
