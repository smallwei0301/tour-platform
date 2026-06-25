import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableSlots } from '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts';

function createSupabaseMock(results) {
  const calls = [];
  let index = 0;
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
    constructor(table) {
      this.table = table;
      this.filters = [];
    }
    select() {
      return this;
    }
    eq(column, value) {
      this.filters.push(['eq', column, value]);
      return this;
    }
    in(column, values) {
      this.filters.push(['in', column, values]);
      return Promise.resolve(take('in', this.table, this.filters));
    }
    or(value) {
      this.filters.push(['or', value]);
      return Promise.resolve(take('or', this.table, this.filters));
    }
    limit(value) {
      this.filters.push(['limit', value]);
      return Promise.resolve(take('limit', this.table, this.filters));
    }
    order(column, options) {
      this.filters.push(['order', column, options]);
      return this;
    }
    maybeSingle() {
      return Promise.resolve(take('maybeSingle', this.table, this.filters));
    }
    single() {
      return Promise.resolve(take('single', this.table, this.filters));
    }
    then(resolve, reject) {
      return Promise.resolve(take('then', this.table, this.filters)).then(resolve, reject);
    }
  }

  return {
    client: { from(table) { return new Query(table); } },
    calls,
    assertAllConsumed() {
      assert.equal(index, results.length, 'not all mocked queries were consumed');
    },
  };
}

function buildRequest(url) {
  return { nextUrl: new URL(url) };
}


test('issue787 behavior: legacy plan slug + schedule fallback succeeds when schedule.plan_id is null and exactly one active plan exists', async () => {
  const activityId = '11111111-1111-1111-1111-111111111111';
  const scheduleId = '22222222-2222-2222-2222-222222222222';
  const fallbackPlanId = '33333333-3333-4333-8333-333333333333';

  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: activityId } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: { id: scheduleId, plan_id: null } },
    { terminal: 'limit', table: 'activity_plans', data: [{ id: fallbackPlanId }] },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: { id: scheduleId, activity_id: activityId, plan_id: null, start_at: '2026-07-01T09:00:00.000Z', end_at: '2026-07-01T11:00:00.000Z', capacity: 10, booked_count: 2, status: 'open' } },
    { terminal: 'single', table: 'activity_plans', data: { id: fallbackPlanId, activity_id: activityId, duration_minutes: 120, min_participants: 1, max_participants: 10, booking_type: 'scheduled', status: 'active', activities: { id: activityId, guide_id: '44444444-4444-4444-4444-444444444444' } } },
    { terminal: 'or', table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates', data: [] },
    { terminal: 'in', table: 'bookings', data: [] },
  ]);

  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${activityId}/available-slots?planId=half-day-morning&scheduleId=${scheduleId}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId }) },
    { createClient: async () => supabase.client }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.planId, fallbackPlanId);

  const scheduleLookup = supabase.calls.find((call) => call.table === 'activity_schedules' && call.terminal === 'maybeSingle');
  assert.deepEqual(scheduleLookup.filters, [['eq', 'id', scheduleId], ['eq', 'activity_id', activityId]]);
  supabase.assertAllConsumed();
});


test('issue787 behavior: status-null formal plan legacy_plan_id fallback returns scheduled plan details', async () => {
  const activityId = '11111111-1111-1111-1111-111111111111';
  const resolvedPlanId = '33333333-3333-4333-8333-333333333333';

  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: activityId } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_plans', data: { id: resolvedPlanId } },
    {
      terminal: 'single',
      table: 'activity_plans',
      data: {
        id: resolvedPlanId,
        activity_id: activityId,
        duration_minutes: 480,
        min_participants: 1,
        max_participants: 10,
        booking_type: 'scheduled',
        status: null,
        activities: { id: activityId, guide_id: '44444444-4444-4444-4444-444444444444' },
      },
    },
    { terminal: 'or', table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates', data: [] },
    { terminal: 'in', table: 'bookings', data: [] },
    // scheduled 方案：available-slots 會列出固定場次（此測試聚焦 plan 解析，給空清單即可）。
    { terminal: 'or', table: 'activity_schedules', data: [] },
  ]);

  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${activityId}/available-slots?planId=full-day-complete&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId }) },
    { createClient: async () => supabase.client }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.planId, resolvedPlanId);

  const legacyPlanLookup = supabase.calls.find((call) =>
    call.table === 'activity_plans' &&
    call.terminal === 'maybeSingle' &&
    call.filters.some((f) => f[0] === 'eq' && f[1] === 'legacy_plan_id' && f[2] === 'full-day-complete')
  );
  assert.ok(legacyPlanLookup, 'should query activity_plans by legacy_plan_id inside current activity scope');
  assert.equal(legacyPlanLookup.filters[0][0], 'eq');
  assert.equal(legacyPlanLookup.filters[1][0], 'eq');
  supabase.assertAllConsumed();
});

test('issue838 behavior: full-day-complete falls back to same-activity derived slug full-day', async () => {
  const activityId = '11111111-1111-1111-1111-111111111111';
  const resolvedPlanId = '77777777-7777-4777-8777-777777777777';

  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: activityId } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_plans', data: { id: resolvedPlanId } },
    {
      terminal: 'single',
      table: 'activity_plans',
      data: {
        id: resolvedPlanId,
        activity_id: activityId,
        duration_minutes: 480,
        min_participants: 1,
        max_participants: 10,
        booking_type: 'scheduled',
        status: 'active',
        activities: { id: activityId, guide_id: '44444444-4444-4444-4444-444444444444' },
      },
    },
    { terminal: 'or', table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates', data: [] },
    { terminal: 'in', table: 'bookings', data: [] },
    // scheduled 方案：available-slots 會列出固定場次（此測試聚焦 plan 解析，給空清單即可）。
    { terminal: 'or', table: 'activity_schedules', data: [] },
  ]);

  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${activityId}/available-slots?planId=full-day-complete&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId }) },
    { createClient: async () => supabase.client }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.planId, resolvedPlanId);

  const derivedSlugLookup = supabase.calls.find((call) =>
    call.table === 'activity_plans' &&
    call.terminal === 'maybeSingle' &&
    call.filters.some((f) => f[0] === 'eq' && f[1] === 'slug' && f[2] === 'full-day')
  );
  assert.ok(derivedSlugLookup, 'should fallback to derived slug lookup in current activity scope');
  supabase.assertAllConsumed();
});

test('issue787 behavior: ambiguous active plans returns 200 empty slots with AMBIGUOUS_PLAN reason (no noisy 409)', async () => {
  // GH-960 contract: expected unavailable/ambiguous booking states should be
  // handled as successful empty availability payloads to avoid repeated
  // unhandled 409 resource noise in Booking V2 clients.

  const activityId = '11111111-1111-1111-1111-111111111111';
  const scheduleId = '22222222-2222-2222-2222-222222222222';

  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: activityId } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: { id: scheduleId, plan_id: null } },
    { terminal: 'limit', table: 'activity_plans', data: [{ id: 'a' }, { id: 'b' }] },
  ]);

  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${activityId}/available-slots?planId=half-day-morning&scheduleId=${scheduleId}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId }) },
    { createClient: async () => supabase.client }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.activityId, activityId);
  assert.equal(body.data.reason, 'AMBIGUOUS_PLAN');
  assert.ok(body.data.messageZh && body.data.messageZh.length > 0);
  assert.ok(Array.isArray(body.data.slots));
  assert.equal(body.data.slots.length, 0);
  supabase.assertAllConsumed();
});

test('issue787 behavior: stale scheduleId on a scheduled plan lists the plan fixed sessions (empty when none open)', async () => {
  const activityId = '11111111-1111-1111-1111-111111111111';
  const scheduleId = '22222222-2222-2222-2222-222222222222';
  const planId = '33333333-3333-4333-8333-333333333333';

  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: activityId } },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: null },
    { terminal: 'or', table: 'activity_schedules', data: [] },
    { terminal: 'single', table: 'activity_plans', data: { id: planId, activity_id: activityId, duration_minutes: 120, min_participants: 1, max_participants: 10, booking_type: 'scheduled', status: 'active', is_year_round: true, activities: { id: activityId, guide_id: '44444444-4444-4444-4444-444444444444' } } },
    { terminal: 'or', table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates', data: [] },
    { terminal: 'in', table: 'bookings', data: [] },
    // scheduled 方案無 selectedSchedule → 改列出固定場次（此處無開放場次，回空清單）。
    { terminal: 'or', table: 'activity_schedules', data: [] },
  ]);

  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${activityId}/available-slots?planId=${planId}&scheduleId=${scheduleId}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId }) },
    { createClient: async () => supabase.client }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.activityId, activityId);
  assert.equal(body.data.planId, planId);
  assert.ok(Array.isArray(body.data.slots));
  supabase.assertAllConsumed();
});

test('issue841 behavior: stale scheduleId falls back to matching date-range schedules when rules are empty', async () => {
  const activityId = '11111111-1111-1111-1111-111111111111';
  const staleScheduleId = '22222222-2222-2222-2222-222222222222';
  const planId = '33333333-3333-4333-8333-333333333333';
  const matchedScheduleId = '55555555-5555-4555-8555-555555555555';

  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: activityId } },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: null },
    { terminal: 'or', table: 'activity_schedules', data: [{ id: matchedScheduleId, activity_id: activityId, plan_id: planId, start_at: '2026-07-01T01:00:00.000Z', end_at: '2026-07-01T03:00:00.000Z', capacity: 8, booked_count: 2, status: 'open' }] },
    { terminal: 'single', table: 'activity_plans', data: { id: planId, activity_id: activityId, duration_minutes: 120, min_participants: 1, max_participants: 10, booking_type: 'scheduled', status: 'active', is_year_round: true, activities: { id: activityId, guide_id: '44444444-4444-4444-4444-444444444444' } } },
    { terminal: 'or', table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates', data: [] },
    { terminal: 'in', table: 'bookings', data: [] },
  ]);

  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${activityId}/available-slots?planId=${planId}&scheduleId=${staleScheduleId}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=4`),
    { params: Promise.resolve({ activityId }) },
    { createClient: async () => supabase.client }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.activityId, activityId);
  assert.equal(body.data.planId, planId);
  assert.equal(body.data.slots.length, 1);
  assert.equal(body.data.slots[0].capacityLeft, 6);
  supabase.assertAllConsumed();
});

test('issue841 behavior: stale scheduleId fallback enforces schedule remaining capacity', async () => {
  const activityId = '11111111-1111-1111-1111-111111111111';
  const staleScheduleId = '22222222-2222-2222-2222-222222222222';
  const planId = '33333333-3333-4333-8333-333333333333';
  const matchedScheduleId = '55555555-5555-4555-8555-555555555555';

  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: activityId } },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: null },
    { terminal: 'or', table: 'activity_schedules', data: [{ id: matchedScheduleId, activity_id: activityId, plan_id: planId, start_at: '2026-07-01T01:00:00.000Z', end_at: '2026-07-01T03:00:00.000Z', capacity: 3, booked_count: 2, status: 'open' }] },
    {
      terminal: 'single',
      table: 'activity_plans',
      data: {
        id: planId,
        activity_id: activityId,
        duration_minutes: 120,
        min_participants: 1,
        max_participants: 10,
        booking_type: 'scheduled',
        status: 'active',
        is_year_round: true,
        activities: { id: activityId, guide_id: '44444444-4444-4444-4444-444444444444' },
      },
    },
    { terminal: 'or', table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates', data: [] },
    { terminal: 'in', table: 'bookings', data: [] },
  ]);

  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${activityId}/available-slots?planId=${planId}&scheduleId=${staleScheduleId}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=2`),
    { params: Promise.resolve({ activityId }) },
    { createClient: async () => supabase.client }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.activityId, activityId);
  assert.equal(body.data.planId, planId);
  assert.equal(body.data.slots.length, 0);
  assert.equal(body.data.reason, 'CAPACITY_EXCEEDED');
  assert.equal(body.data.messageZh, '此行程最多 3 人，當前時段剩餘 1 人可預訂');
  supabase.assertAllConsumed();
});

test('issue841 behavior: stale scheduleId fallback enforces minParticipants for selected schedule', async () => {
  const activityId = '11111111-1111-1111-1111-111111111111';
  const staleScheduleId = '22222222-2222-2222-2222-222222222222';
  const planId = '33333333-3333-4333-8333-333333333333';
  const matchedScheduleId = '55555555-5555-4555-8555-555555555555';

  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: activityId } },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: null },
    { terminal: 'or', table: 'activity_schedules', data: [{ id: matchedScheduleId, activity_id: activityId, plan_id: planId, start_at: '2026-07-01T01:00:00.000Z', end_at: '2026-07-01T03:00:00.000Z', capacity: 8, booked_count: 2, status: 'open' }] },
    {
      terminal: 'single',
      table: 'activity_plans',
      data: {
        id: planId,
        activity_id: activityId,
        duration_minutes: 120,
        min_participants: 4,
        max_participants: 10,
        booking_type: 'scheduled',
        status: 'active',
        is_year_round: true,
        activities: { id: activityId, guide_id: '44444444-4444-4444-4444-444444444444' },
      },
    },
    { terminal: 'or', table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates', data: [] },
    { terminal: 'in', table: 'bookings', data: [] },
  ]);

  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${activityId}/available-slots?planId=${planId}&scheduleId=${staleScheduleId}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId }) },
    { createClient: async () => supabase.client }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.activityId, activityId);
  assert.equal(body.data.planId, planId);
  assert.equal(body.data.slots.length, 0);
  assert.equal(body.data.reason, 'MIN_PARTICIPANTS_NOT_MET');
  assert.equal(body.data.messageZh, '此行程最少 4 人成團，請至少選擇 4 人');
  supabase.assertAllConsumed();
});
