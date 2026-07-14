import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAvailableSlots } from '../../app/api/v2/activities/[activityId]/available-slots/route-handler.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const ROUTE_PATH = path.join(
  WEB_ROOT,
  'app/api/v2/activities/[activityId]/available-slots/route-handler.ts',
);

const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const GUIDE_ID = 'guide_issue1665';

function buildRequest() {
  return {
    nextUrl: new URL(
      `https://example.test/api/v2/activities/${ACTIVITY_ID}/available-slots?planId=${PLAN_ID}&dateFrom=2026-07-20&dateTo=2026-07-20&timezone=Asia%2FTaipei&participants=1`,
    ),
  };
}

function createSequenceClient(name, steps) {
  const calls = [];
  let index = 0;

  const take = (terminal, table, filters, selectColumns) => {
    calls.push({ client: name, terminal, table, filters: [...filters], select: selectColumns });
    const next = steps[index++];
    assert.ok(next, `${name}: unexpected ${terminal} query on ${table}`);
    assert.equal(next.terminal, terminal, `${name}: terminal mismatch at step ${index - 1}`);
    assert.equal(next.table, table, `${name}: table mismatch at step ${index - 1}`);
    return { data: next.data ?? null, error: next.error ?? null };
  };

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.selectColumns = null;
    }

    select(columns = '*') {
      this.selectColumns = columns;
      return this;
    }

    eq(column, value) {
      this.filters.push(['eq', column, value]);
      return this;
    }

    in(column, values) {
      this.filters.push(['in', column, values]);
      return Promise.resolve(take('in', this.table, this.filters, this.selectColumns));
    }

    or(expression) {
      this.filters.push(['or', expression]);
      return Promise.resolve(take('or', this.table, this.filters, this.selectColumns));
    }

    maybeSingle() {
      return Promise.resolve(take('maybeSingle', this.table, this.filters, this.selectColumns));
    }

    single() {
      return Promise.resolve(take('single', this.table, this.filters, this.selectColumns));
    }

    then(resolve, reject) {
      return Promise.resolve(take('then', this.table, this.filters, this.selectColumns)).then(
        resolve,
        reject,
      );
    }
  }

  return {
    client: {
      from(table) {
        return new Query(table);
      },
    },
    calls,
    assertAllConsumed() {
      assert.equal(index, steps.length, `${name}: consumed ${index}/${steps.length} expected queries`);
    },
  };
}

test('GH-1665: available-slots reads protected availability internals with controlled server client, not public route client', async () => {
  const publicClient = createSequenceClient('public', [
    { terminal: 'maybeSingle', table: 'activities', data: { id: ACTIVITY_ID } },
    {
      terminal: 'single',
      table: 'activity_plans',
      data: {
        id: PLAN_ID,
        activity_id: ACTIVITY_ID,
        duration_minutes: 60,
        min_participants: 1,
        max_participants: 8,
        booking_type: 'scheduled',
        is_year_round: true,
        status: 'active',
        name: 'Issue 1665 Scheduled Plan',
        price_type: 'per_person',
        base_price: 1000,
        activities: { id: ACTIVITY_ID, guide_id: GUIDE_ID },
      },
    },
    {
      terminal: 'or',
      table: 'guide_availability_rules',
      error: { code: '42501', message: 'permission denied for table guide_availability_rules' },
    },
  ]);

  const protectedClient = createSequenceClient('protected', [
    { terminal: 'or', table: 'guide_availability_rules', data: [] },
    { terminal: 'then', table: 'guide_blackout_dates', data: [] },
    { terminal: 'in', table: 'bookings', data: [] },
    { terminal: 'then', table: 'activity_plan_seasons', data: [] },
    { terminal: 'then', table: 'guide_slot_conflict_overrides', data: [] },
    { terminal: 'or', table: 'activity_schedules', data: [] },
  ]);

  const response = await getAvailableSlots(
    buildRequest(),
    { params: Promise.resolve({ activityId: ACTIVITY_ID }) },
    {
      createClient: async () => publicClient.client,
      getProtectedReadClient: async () => protectedClient.client,
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.data.slots, []);

  const publicProtectedTables = publicClient.calls
    .map((call) => call.table)
    .filter((table) => ['guide_availability_rules', 'guide_blackout_dates', 'bookings'].includes(table));
  assert.deepEqual(publicProtectedTables, [], 'public route client must not query protected internals');
  protectedClient.assertAllConsumed();
});

test('GH-1665 source contract: protected reads use explicit columns and controlled read client', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf8');

  assert.match(src, /getProtectedReadClient/);
  assert.match(src, /const protectedReadSupabase\s*=\s*await resolveProtectedReadClient\(/);

  for (const table of ['guide_availability_rules', 'guide_blackout_dates', 'bookings']) {
    assert.match(src, new RegExp(`protectedReadSupabase\\s*\\n\\s*\\.from\\('${table}'\\)`));
  }

  const rulesWindow = src.slice(src.indexOf(".from('guide_availability_rules')"), src.indexOf('if (rulesError)'));
  const blackoutsWindow = src.slice(src.indexOf(".from('guide_blackout_dates')"), src.indexOf('if (blackoutsError)'));

  assert.doesNotMatch(rulesWindow, /\.select\('\*'\)/, 'rules query must not select *');
  assert.doesNotMatch(blackoutsWindow, /\.select\('\*'\)/, 'blackouts query must not select *');
  assert.match(rulesWindow, /id, guide_id, activity_plan_id, weekday, start_time_local, end_time_local, timezone, slot_interval_minutes, buffer_before_minutes, buffer_after_minutes, effective_from, effective_to, is_active, use_dynamic_reemit/);
  assert.match(blackoutsWindow, /id, guide_id, starts_at, ends_at, reason, source/);
});
