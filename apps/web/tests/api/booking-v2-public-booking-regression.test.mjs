/**
 * Full Public Booking Regression — Issue #885
 *
 * PR-level fixture tests that lock in the five failure conditions from #880
 * and confirm post-#886/#887 fixes are not regressed.
 *
 * All five ACs are exercised via mocked Supabase (no live DB needed):
 *   A1. Raw 'Invalid planId format' MUST NOT appear for unresolved slugs
 *   A2. Unresolved slug → 404 PLAN_NOT_FOUND with details.planKey
 *   A3. Inactive plan → PLAN_INACTIVE (not bookable)
 *   A4. Ambiguous schedule fallback → 409 AMBIGUOUS_PLAN
 *   A5. capacityLeft ≤ plan.max_participants (capacity cap)
 *
 * Source-pattern guards (read the file, check import + Math.min):
 *   S1. route-handler.ts imports resolveBookingPlan
 *   S2. route-handler.ts has capacityLeft: Math.min(..., plan.max_participants)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { resolveBookingPlan } from '../../src/lib/booking-plan-resolver.ts';
import { getAvailableSlots } from '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const handlerPath = path.resolve(
  __dirname,
  '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts',
);

// ── Shared Supabase mock factory (mirrors #882/#880 pattern) ─────────────────

function createSupabaseMock(results) {
  let index = 0;
  const calls = [];
  const take = (terminal, table, filters) => {
    const next = results[index++];
    assert.ok(next, `unexpected query: ${terminal} on ${table} (index ${index - 1})`);
    assert.equal(next.terminal, terminal, `terminal mismatch for ${table} at index ${index - 1}`);
    assert.equal(next.table, table, `table mismatch for ${terminal} at index ${index - 1}`);
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
    assertAllConsumed() {
      assert.equal(index, results.length, `not all mocked queries consumed (used ${index}/${results.length})`);
    },
  };
}

function buildRequest(url) { return { nextUrl: new URL(url) }; }

// ── Fixed UUIDs ──────────────────────────────────────────────────────────────

const ACTIVITY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAN_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_PLAN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SCHEDULE   = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

// ── S1/S2: Source-pattern guards ─────────────────────────────────────────────

test('#885 source: route-handler imports resolveBookingPlan (PR #887 contract)', () => {
  const src = readFileSync(handlerPath, 'utf8');
  assert.match(
    src,
    /import.*resolveBookingPlan.*from/,
    'route-handler.ts must import resolveBookingPlan from booking-plan-resolver',
  );
});

test('#885 source: route-handler uses Math.min(..., plan.max_participants) for capacityLeft (PR #886 cap)', () => {
  const src = readFileSync(handlerPath, 'utf8');
  assert.match(
    src,
    /capacityLeft\s*:.*Math\.min\s*\(/,
    'route-handler.ts must cap capacityLeft with Math.min (PR #886)',
  );
  assert.match(
    src,
    /Math\.min\s*\([^)]*max_participants/,
    'Math.min cap must reference plan.max_participants',
  );
});

// ── A1: Raw 'Invalid planId format' must NOT appear for unresolved slugs ─────

test('#885 A1: resolveBookingPlan for unresolved public slug is NOT VALIDATION_ERROR/Invalid planId format', async () => {
  // Regression against pre-#886 behaviour: raw slug passed as planKey returned
  // 400 VALIDATION_ERROR with message 'Invalid planId format'. Post-#886 it must
  // return PLAN_NOT_FOUND instead.
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: null }, // slug lookup misses
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY,
    planKey: 'full-day-complete',
  });
  assert.equal(out.ok, false, 'unresolved slug must fail');
  assert.notEqual(
    out.code,
    'VALIDATION_ERROR',
    'must NOT return VALIDATION_ERROR for an unresolved slug',
  );
  if (out.messageEn) {
    assert.ok(
      !out.messageEn.includes('Invalid planId format'),
      `messageEn must not contain 'Invalid planId format'; got: ${out.messageEn}`,
    );
  }
  supabase.assertAllConsumed();
});

test('#885 A1: route-level regression — slug returns 404, not 400 VALIDATION_ERROR', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
  ]);
  const response = await getAvailableSlots(
    buildRequest(`https://x.test/api/v2/activities/${ACTIVITY}/available-slots?planId=full-day-complete&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId: ACTIVITY }) },
    { createClient: async () => supabase.client },
  );
  assert.notEqual(response.status, 400, 'unresolved slug must not return 400');
  const body = await response.json();
  assert.notEqual(
    body.error?.code,
    'VALIDATION_ERROR',
    'must not be VALIDATION_ERROR for unresolved slug',
  );
  if (body.error?.message) {
    assert.ok(
      !body.error.message.includes('Invalid planId format'),
      `response must not contain 'Invalid planId format' for slug; got: ${body.error.message}`,
    );
  }
});

// ── A2: Multiple unresolved slugs → 404 PLAN_NOT_FOUND with details.planKey ──

const UNRESOLVED_SLUGS = [
  'full-day-complete',
  'standard',
  'morning-walk',
  'afternoon-tea',
];

for (const slug of UNRESOLVED_SLUGS) {
  test(`#885 A2: unresolved slug '${slug}' → PLAN_NOT_FOUND with details.planKey`, async () => {
    const supabase = createSupabaseMock([
      { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    ]);
    const out = await resolveBookingPlan(supabase.client, {
      activityId: ACTIVITY,
      planKey: slug,
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, 'PLAN_NOT_FOUND', `slug '${slug}' must yield PLAN_NOT_FOUND`);
    assert.equal(
      out.details?.planKey,
      slug,
      `details.planKey must echo the slug '${slug}'`,
    );
    supabase.assertAllConsumed();
  });
}

test('#885 A2: route returns 404 + PLAN_NOT_FOUND + details.planKey for unresolved slug', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
  ]);
  const response = await getAvailableSlots(
    buildRequest(`https://x.test/api/v2/activities/${ACTIVITY}/available-slots?planId=standard&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId: ACTIVITY }) },
    { createClient: async () => supabase.client },
  );
  assert.equal(response.status, 404, 'must return 404 for PLAN_NOT_FOUND');
  const body = await response.json();
  assert.equal(body.error.code, 'PLAN_NOT_FOUND');
  assert.equal(body.error.details?.planKey, 'standard', 'details.planKey must echo the slug');
  supabase.assertAllConsumed();
});

// ── A3: Inactive plan → PLAN_INACTIVE ────────────────────────────────────────

test('#885 A3: slug resolves to inactive plan → PLAN_INACTIVE (not bookable)', async () => {
  const supabase = createSupabaseMock([
    {
      terminal: 'maybeSingle',
      table: 'activity_plans',
      data: { id: PLAN_UUID, slug: 'standard-plan', status: 'inactive', booking_type: 'scheduled' },
    },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY,
    planKey: 'standard-plan',
  });
  assert.equal(out.ok, false, 'inactive plan must not resolve as ok');
  assert.equal(out.code, 'PLAN_INACTIVE', 'must return PLAN_INACTIVE for status=inactive');
  supabase.assertAllConsumed();
});

test('#885 A3: archived plan slug → PLAN_INACTIVE (covers non-active statuses)', async () => {
  const supabase = createSupabaseMock([
    {
      terminal: 'maybeSingle',
      table: 'activity_plans',
      data: { id: PLAN_UUID, slug: 'old-plan', status: 'archived', booking_type: 'scheduled' },
    },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY,
    planKey: 'old-plan',
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'PLAN_INACTIVE');
  supabase.assertAllConsumed();
});

// ── A4: Ambiguous schedule fallback → 409 AMBIGUOUS_PLAN ─────────────────────

test('#885 A4: slug + scheduleId + plan_id null + 2 active plans → AMBIGUOUS_PLAN', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    {
      terminal: 'maybeSingle',
      table: 'activity_schedules',
      data: { id: SCHEDULE, activity_id: ACTIVITY, plan_id: null },
    },
    {
      terminal: 'limit',
      table: 'activity_plans',
      data: [
        { id: PLAN_UUID, slug: 'plan-a', status: 'active', booking_type: 'scheduled' },
        { id: OTHER_PLAN, slug: 'plan-b', status: 'active', booking_type: 'scheduled' },
      ],
    },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY,
    planKey: 'some-legacy-slug',
    scheduleId: SCHEDULE,
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'AMBIGUOUS_PLAN', 'must return AMBIGUOUS_PLAN when plan_id null + multiple actives');
  assert.equal(out.details?.activityId, ACTIVITY, 'details must carry activityId');
  assert.equal(out.details?.scheduleId, SCHEDULE, 'details must carry scheduleId');
  supabase.assertAllConsumed();
});

test('#885 A4: route returns 409 for ambiguous schedule fallback', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    {
      terminal: 'maybeSingle',
      table: 'activity_schedules',
      data: { id: SCHEDULE, activity_id: ACTIVITY, plan_id: null },
    },
    {
      terminal: 'limit',
      table: 'activity_plans',
      data: [{ id: PLAN_UUID, slug: 'x' }, { id: OTHER_PLAN, slug: 'y' }],
    },
  ]);
  const response = await getAvailableSlots(
    buildRequest(`https://x.test/api/v2/activities/${ACTIVITY}/available-slots?planId=ambiguous-slug&scheduleId=${SCHEDULE}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId: ACTIVITY }) },
    { createClient: async () => supabase.client },
  );
  assert.equal(response.status, 409, 'ambiguous schedule must yield 409');
  const body = await response.json();
  assert.equal(body.error.code, 'AMBIGUOUS_PLAN');
  supabase.assertAllConsumed();
});

// ── A5: capacityLeft ≤ plan.max_participants (PR #886 cap) ───────────────────

test('#885 A5: schedule.capacity(11) > plan.max_participants(10) → capacityLeft capped at 10', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY } },
    {
      terminal: 'maybeSingle',
      table: 'activity_schedules',
      data: {
        id: SCHEDULE,
        activity_id: ACTIVITY,
        plan_id: null,
        start_at: '2026-07-01T09:00:00.000Z',
        end_at:   '2026-07-01T11:00:00.000Z',
        capacity: 11,   // schedule raw capacity > plan max
        booked_count: 0,
        status: 'open',
      },
    },
    {
      terminal: 'single',
      table: 'activity_plans',
      data: {
        id: PLAN_UUID,
        activity_id: ACTIVITY,
        duration_minutes: 120,
        min_participants: 1,
        max_participants: 10,   // plan cap is 10
        booking_type: 'scheduled',
        status: 'active',
        activities: { id: ACTIVITY, guide_id: '44444444-4444-4444-4444-444444444444' },
      },
    },
    { terminal: 'or',   table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates',     data: [] },
    { terminal: 'in',   table: 'bookings',                 data: [] },
  ]);
  const response = await getAvailableSlots(
    buildRequest(`https://x.test/api/v2/activities/${ACTIVITY}/available-slots?planId=${PLAN_UUID}&scheduleId=${SCHEDULE}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId: ACTIVITY }) },
    { createClient: async () => supabase.client },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.selectedPlan.maxParticipants, 10, 'selectedPlan.maxParticipants must be 10');
  assert.ok(body.data.slots.length > 0, 'must return at least one slot');
  for (const slot of body.data.slots) {
    assert.ok(
      slot.capacityLeft <= 10,
      `capacityLeft (${slot.capacityLeft}) must not exceed plan.maxParticipants (10) — PR #886 cap`,
    );
  }
  // Specifically assert it is 10, not 11 (i.e. the cap is applied)
  assert.equal(
    body.data.slots[0].capacityLeft,
    10,
    'capacityLeft must be exactly 10 (capped from schedule.capacity 11)',
  );
  supabase.assertAllConsumed();
});

test('#885 A5: schedule.capacity(5) < plan.max_participants(10) → capacityLeft is 5, not 10', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY } },
    {
      terminal: 'maybeSingle',
      table: 'activity_schedules',
      data: {
        id: SCHEDULE,
        activity_id: ACTIVITY,
        plan_id: null,
        start_at: '2026-07-01T09:00:00.000Z',
        end_at:   '2026-07-01T11:00:00.000Z',
        capacity: 5,    // schedule capacity is smaller
        booked_count: 0,
        status: 'open',
      },
    },
    {
      terminal: 'single',
      table: 'activity_plans',
      data: {
        id: PLAN_UUID,
        activity_id: ACTIVITY,
        duration_minutes: 120,
        min_participants: 1,
        max_participants: 10,
        booking_type: 'scheduled',
        status: 'active',
        activities: { id: ACTIVITY, guide_id: '44444444-4444-4444-4444-444444444444' },
      },
    },
    { terminal: 'or',   table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates',     data: [] },
    { terminal: 'in',   table: 'bookings',                 data: [] },
  ]);
  const response = await getAvailableSlots(
    buildRequest(`https://x.test/api/v2/activities/${ACTIVITY}/available-slots?planId=${PLAN_UUID}&scheduleId=${SCHEDULE}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId: ACTIVITY }) },
    { createClient: async () => supabase.client },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  for (const slot of body.data.slots) {
    assert.ok(
      slot.capacityLeft <= 5,
      `capacityLeft (${slot.capacityLeft}) must be bounded by schedule.capacity (5)`,
    );
  }
});
