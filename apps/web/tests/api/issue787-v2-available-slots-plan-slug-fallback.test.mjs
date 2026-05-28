import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableSlots } from '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts';

function createSupabaseMock(results) {
  const calls = [];
  let index = 0;

  const take = (terminal, table, filters) => {
    const next = results[index++];
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

test('issue787 behavior: ambiguous active plans fails closed with PLAN_NOT_FOUND (#880 contract update)', async () => {
  // Original #787 returned 400 VALIDATION_ERROR. #880 narrowed that contract:
  // unresolved/ambiguous plans now return 404 PLAN_NOT_FOUND so client UIs
  // can show a localized "no longer bookable" message instead of treating it
  // as an input-format error.
  const activityId = '11111111-1111-1111-1111-111111111111';
  const scheduleId = '22222222-2222-2222-2222-222222222222';

  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: activityId } },
    { terminal: 'maybeSingle', table: 'activity_plans', data: null },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: { id: scheduleId, plan_id: null } },
    { terminal: 'limit', table: 'activity_plans', data: [{ id: 'a' }, { id: 'b' }] },
  ]);

  const response = await getAvailableSlots(
    buildRequest(`https://example.test/api/v2/activities/${activityId}/available-slots?planId=half-day-morning&scheduleId=${scheduleId}&dateFrom=2026-07-01&dateTo=2026-07-01&timezone=Asia/Taipei&participants=1`),
    { params: Promise.resolve({ activityId }) },
    { createClient: async () => supabase.client }
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error.code, 'PLAN_NOT_FOUND');
  assert.equal(body.error.details?.planKey, 'half-day-morning');
  supabase.assertAllConsumed();
});

test('issue787 behavior: stale scheduleId is ignored and falls back to date-range availability generation', async () => {
  const activityId = '11111111-1111-1111-1111-111111111111';
  const scheduleId = '22222222-2222-2222-2222-222222222222';
  const planId = '33333333-3333-4333-8333-333333333333';

  const supabase = createSupabaseMock([
    { terminal: 'maybeSingle', table: 'activities', data: { id: activityId } },
    { terminal: 'maybeSingle', table: 'activity_schedules', data: null },
    { terminal: 'or', table: 'activity_schedules', data: [] },
    { terminal: 'single', table: 'activity_plans', data: { id: planId, activity_id: activityId, duration_minutes: 120, min_participants: 1, max_participants: 10, booking_type: 'scheduled', status: 'active', activities: { id: activityId, guide_id: '44444444-4444-4444-4444-444444444444' } } },
    { terminal: 'or', table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates', data: [] },
    { terminal: 'in', table: 'bookings', data: [] },
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
    { terminal: 'single', table: 'activity_plans', data: { id: planId, activity_id: activityId, duration_minutes: 120, min_participants: 1, max_participants: 10, booking_type: 'scheduled', status: 'active', activities: { id: activityId, guide_id: '44444444-4444-4444-4444-444444444444' } } },
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
