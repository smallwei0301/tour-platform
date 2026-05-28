/**
 * Contract + behavioural tests for Issue #882 — Canonical Booking Plan Resolver.
 *
 * Source of truth: docs/05-business/06-payment-plan & #880/#882 acceptance criteria.
 *
 * The resolver consolidates the inline slug → schedule → ambiguous-plan fallback
 * that used to live in available-slots/route-handler.ts:215-266 into a single
 * pure async function. Tests here exercise the helper directly (mocked Supabase)
 * so downstream consumers — available-slots (#880), publish gate (#881), data
 * audit (#883), capacity validator (#884), crawl regression (#885) — can rely
 * on one resolution contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveBookingPlan } from '../../src/lib/booking-plan-resolver.ts';

// ── Supabase mock (same pattern as #787 / #880) ──────────────────────────────

function createSupabaseMock(results) {
  let index = 0;
  const calls = [];
  const take = (terminal, table, filters) => {
    const next = results[index++];
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

const ACTIVITY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAN_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_PLAN_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SCHEDULE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

// ── 1. UUID planKey ──────────────────────────────────────────────────────────

test('#882 resolver: UUID planKey passes through with no DB call (downstream validates)', async () => {
  // Design decision: UUID planKey is trusted at resolver layer; the route
  // handler's existing plan-detail fetch validates existence + active status
  // and returns 404 NOT_FOUND for missing / inactive UUIDs (unchanged from
  // pre-#882 behaviour). This keeps the hot path one round-trip lighter and
  // avoids breaking every UUID-keyed fixture in the existing test suite.
  const supabase = createSupabaseMock([]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: PLAN_UUID,
  });
  assert.equal(out.ok, true);
  assert.equal(out.planId, PLAN_UUID);
  assert.equal(out.resolution, 'uuid');
  assert.equal(out.planStatus, 'active');
  assert.equal(supabase.calls.length, 0, 'UUID planKey must not trigger any DB query');
});

// ── 2. Formal slug planKey ───────────────────────────────────────────────────

test('#882 resolver: formal slug + active → ok with resolution=slug', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: { id: PLAN_UUID, slug: 'half-day-morning', status: 'active', booking_type: 'scheduled' } },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: 'half-day-morning',
  });
  assert.equal(out.ok, true);
  assert.equal(out.planId, PLAN_UUID);
  assert.equal(out.planSlug, 'half-day-morning');
  assert.equal(out.resolution, 'slug');
  supabase.assertAllConsumed();
});

test('#882 resolver: slug found but inactive → PLAN_INACTIVE (covers #880 §6 standard-plan)', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: { id: PLAN_UUID, slug: 'standard-plan', status: 'inactive', booking_type: 'scheduled' } },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: 'standard-plan',
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'PLAN_INACTIVE');
});

test('#882 resolver: slug not in formal table + no scheduleId → PLAN_NOT_FOUND', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: 'full-day-complete',
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'PLAN_NOT_FOUND');
  assert.equal(out.details.planKey, 'full-day-complete');
  assert.equal(out.details.scheduleId, undefined);
});

// ── 3. scheduleId fallback ───────────────────────────────────────────────────

test('#882 resolver: legacy slug + scheduleId.plan_id resolves to formal UUID → ok resolution=schedule_plan_id', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: { id: SCHEDULE, activity_id: ACTIVITY, plan_id: PLAN_UUID } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: { id: PLAN_UUID, slug: 'half-day', status: 'active', booking_type: 'scheduled' } },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: 'full-day-complete', scheduleId: SCHEDULE,
  });
  assert.equal(out.ok, true);
  assert.equal(out.planId, PLAN_UUID);
  assert.equal(out.scheduleId, SCHEDULE);
  assert.equal(out.resolution, 'schedule_plan_id');
});

test('#882 resolver: slug not found + scheduleId.plan_id null + single active plan → ok resolution=single_active_fallback', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: { id: SCHEDULE, activity_id: ACTIVITY, plan_id: null } },
    { terminal: 'limit', table: 'activity_plans', data: [{ id: PLAN_UUID, slug: 'half-day', status: 'active', booking_type: 'scheduled' }] },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: 'full-day-complete', scheduleId: SCHEDULE,
  });
  assert.equal(out.ok, true);
  assert.equal(out.planId, PLAN_UUID);
  assert.equal(out.resolution, 'single_active_fallback');
});

test('#882 resolver: slug not found + scheduleId.plan_id null + 2 active plans → AMBIGUOUS_PLAN', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: { id: SCHEDULE, activity_id: ACTIVITY, plan_id: null } },
    { terminal: 'limit', table: 'activity_plans', data: [{ id: PLAN_UUID, slug: 'a' }, { id: OTHER_PLAN_UUID, slug: 'b' }] },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: 'full-day-complete', scheduleId: SCHEDULE,
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'AMBIGUOUS_PLAN');
  assert.equal(out.details.activityId, ACTIVITY);
  assert.equal(out.details.scheduleId, SCHEDULE);
  assert.ok(out.messageZh.length > 0);
});

test('#882 resolver: slug not found + scheduleId not in DB → PLAN_NOT_FOUND', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: null },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: 'full-day-complete', scheduleId: SCHEDULE,
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'PLAN_NOT_FOUND');
  assert.equal(out.details.scheduleId, SCHEDULE);
});

test('#882 resolver: scheduleId.activity_id mismatch (cross-activity attack) → PLAN_NOT_FOUND', async () => {
  // The .eq('activity_id', ACTIVITY) filter on the schedules query must prevent
  // a foreign scheduleId from leaking into the resolution. Mocked as data:null
  // because the real query would filter it out before returning.
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: null },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: 'full-day-complete', scheduleId: SCHEDULE,
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'PLAN_NOT_FOUND');
  // Verify the schedule lookup filtered by activity_id
  const scheduleCall = supabase.calls.find((c) => c.table === 'activity_schedules');
  const hasActivityFilter = scheduleCall.filters.some(
    (f) => f[0] === 'eq' && f[1] === 'activity_id' && f[2] === ACTIVITY,
  );
  assert.ok(hasActivityFilter, 'schedule lookup must filter by activity_id');
});

// ── 4. Recursive UUID lookup after schedule.plan_id ──────────────────────────

test('#882 resolver: scheduleId.plan_id UUID is itself inactive → PLAN_INACTIVE', async () => {
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: { id: SCHEDULE, activity_id: ACTIVITY, plan_id: PLAN_UUID } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: { id: PLAN_UUID, slug: 'archived', status: 'archived', booking_type: 'scheduled' } },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: 'legacy', scheduleId: SCHEDULE,
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'PLAN_INACTIVE');
});

// ── 5. Sanity / contract ─────────────────────────────────────────────────────

test('#882 resolver: ACTIVITY_NOT_FOUND when activityId is not UUID-like (defensive)', async () => {
  const supabase = createSupabaseMock([]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: 'not-a-uuid', planKey: PLAN_UUID,
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'ACTIVITY_NOT_FOUND');
  // No DB queries should be issued for a malformed activityId
  assert.equal(supabase.calls.length, 0);
});

test('#882 resolver: every failure has messageEn + messageZh + details', async () => {
  // Use slug planKey so the resolver actually runs through its DB lookup path.
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: 'unknown-slug',
  });
  assert.equal(out.ok, false);
  assert.equal(typeof out.messageEn, 'string');
  assert.ok(out.messageEn.length > 0);
  assert.equal(typeof out.messageZh, 'string');
  assert.ok(out.messageZh.length > 0);
  assert.equal(out.details.planKey, 'unknown-slug');
  assert.equal(out.details.activityId, ACTIVITY);
});

test('#882 resolver: slug-resolved ok carries planSlug + bookingType for downstream consumers', async () => {
  // Slug lookup path returns the full plan metadata; UUID pass-through path
  // (no DB call) returns null for slug/bookingType and trusts the route's
  // downstream plan-detail fetch to surface it instead.
  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activity_plans', data: { id: PLAN_UUID, slug: 'half-day-morning', status: 'active', booking_type: 'request' } },
  ]);
  const out = await resolveBookingPlan(supabase.client, {
    activityId: ACTIVITY, planKey: 'half-day-morning',
  });
  assert.equal(out.ok, true);
  assert.equal(out.planId, PLAN_UUID);
  assert.equal(out.planSlug, 'half-day-morning');
  assert.equal(out.bookingType, 'request');
  assert.equal(out.planStatus, 'active');
});
