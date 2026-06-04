import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const middlewareSrc = readFileSync(path.resolve(ROOT, 'middleware.ts'), 'utf-8');

const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_PLAN_ID = '33333333-3333-4333-8333-333333333333';
const SEASON_ID = '44444444-4444-4444-8444-444444444444';

function routeUrl(pathname) {
  return `https://example.test${pathname}`;
}

async function importDbModule() {
  return import(pathToFileURL(path.resolve(ROOT, 'src/lib/db.mjs')).href);
}

async function importSeasonsRoute() {
  return import(
    `${pathToFileURL(path.resolve(ROOT, 'app/api/v2/admin/activities/[activityId]/plans/[planId]/seasons/route.ts')).href}?t=${Date.now()}`
  );
}

async function importSeasonItemRoute() {
  return import(
    `${pathToFileURL(path.resolve(ROOT, 'app/api/v2/admin/activities/[activityId]/plans/[planId]/seasons/[seasonId]/route.ts')).href}?t=${Date.now()}`
  );
}

function sortRows(rows, orders) {
  const copy = rows.map((row) => ({ ...row }));
  if (!orders.length) return copy;
  return copy.sort((a, b) => {
    for (const { column, ascending } of orders) {
      if (a[column] === b[column]) continue;
      if (a[column] == null) return ascending ? -1 : 1;
      if (b[column] == null) return ascending ? 1 : -1;
      if (a[column] < b[column]) return ascending ? -1 : 1;
      if (a[column] > b[column]) return ascending ? 1 : -1;
    }
    return 0;
  });
}

function createSupabaseMock({ planExists = true, seasons = [] } = {}) {
  const state = {
    seasons: seasons.map((row) => ({ ...row })),
    inserts: [],
    updates: [],
  };

  function resolvePlan(filters) {
    if (!planExists) return null;
    if (filters.id !== PLAN_ID) return null;
    if (filters.activity_id && filters.activity_id !== ACTIVITY_ID) return null;
    return { id: PLAN_ID, activity_id: ACTIVITY_ID };
  }

  function makeSelectQuery(table, ctx = { filters: {}, orders: [] }) {
    const api = {
      select() {
        return api;
      },
      eq(column, value) {
        return makeSelectQuery(table, {
          filters: { ...ctx.filters, [column]: value },
          orders: ctx.orders,
        });
      },
      order(column, options = {}) {
        return makeSelectQuery(table, {
          filters: ctx.filters,
          orders: [...ctx.orders, { column, ascending: options.ascending !== false }],
        });
      },
      single() {
        return Promise.resolve(execute(true));
      },
      maybeSingle() {
        return Promise.resolve(execute(true));
      },
      then(resolve, reject) {
        return Promise.resolve(execute(false)).then(resolve, reject);
      },
    };

    function execute(expectSingle) {
      if (table === 'activity_plans') {
        const plan = resolvePlan(ctx.filters);
        return plan
          ? { data: plan, error: null }
          : { data: null, error: { message: 'not found', code: 'PGRST116' } };
      }

      if (table === 'activity_plan_seasons') {
        let rows = state.seasons.filter((row) => {
          return Object.entries(ctx.filters).every(([column, value]) => row[column] === value);
        });
        rows = sortRows(rows, ctx.orders);
        if (expectSingle) {
          const row = rows[0] ?? null;
          return row ? { data: { ...row }, error: null } : { data: null, error: { message: 'not found', code: 'PGRST116' } };
        }
        return { data: rows.map((row) => ({ ...row })), error: null };
      }

      return { data: expectSingle ? null : [], error: null };
    }

    return api;
  }

  function makeMutationSelect(rowPromise) {
    return {
      select() {
        return {
          single() {
            return Promise.resolve(rowPromise());
          },
        };
      },
    };
  }

  function makeUpdateChain(payload, filters = {}) {
    return {
      eq(column, value) {
        const nextFilters = { ...filters, [column]: value };
        return {
          ...makeUpdateChain(payload, nextFilters),
          select() {
            return {
              single() {
                const rowIndex = state.seasons.findIndex((row) =>
                  Object.entries(nextFilters).every(([key, expected]) => row[key] === expected)
                );
                if (rowIndex === -1) {
                  return Promise.resolve({ data: null, error: { message: 'not found', code: 'PGRST116' } });
                }
                state.seasons[rowIndex] = {
                  ...state.seasons[rowIndex],
                  ...payload,
                };
                state.updates.push({ payload: { ...payload }, filters: { ...nextFilters } });
                return Promise.resolve({ data: { ...state.seasons[rowIndex] }, error: null });
              },
            };
          },
        };
      },
      select() {
        return {
          single() {
            const rowIndex = state.seasons.findIndex((row) =>
              Object.entries(filters).every(([key, expected]) => row[key] === expected)
            );
            if (rowIndex === -1) {
              return Promise.resolve({ data: null, error: { message: 'not found', code: 'PGRST116' } });
            }
            state.seasons[rowIndex] = {
              ...state.seasons[rowIndex],
              ...payload,
            };
            state.updates.push({ payload: { ...payload }, filters: { ...filters } });
            return Promise.resolve({ data: { ...state.seasons[rowIndex] }, error: null });
          },
        };
      },
    };
  }

  return {
    state,
    from(table) {
      if (table === 'activity_plan_seasons') {
        return {
          ...makeSelectQuery(table),
          insert(payload) {
            state.inserts.push({ ...payload });
            const row = {
              id: SEASON_ID,
              created_at: '2026-06-04T01:02:03.000Z',
              updated_at: '2026-06-04T01:02:03.000Z',
              ...payload,
            };
            state.seasons.push(row);
            return makeMutationSelect(() => ({ data: { ...row }, error: null }));
          },
          update(payload) {
            return makeUpdateChain(payload);
          },
        };
      }

      return makeSelectQuery(table);
    },
  };
}

async function readJson(response) {
  return response.json();
}

test('GH-1067 seasons admin route stays under existing /api/v2/admin middleware protection', () => {
  assert.match(middlewareSrc, /pathname\.startsWith\('\/api\/v2\/admin'\)/);
  assert.match(middlewareSrc, /const isAdminApi = pathname\.startsWith\('\/api\/admin'\) \|\| pathname\.startsWith\('\/api\/v2\/admin'\);/);
});

test('GH-1067 RED: GET lists only seasons for the selected plan in predictable order', async () => {
  const db = await importDbModule();
  const route = await importSeasonsRoute();
  const supabase = createSupabaseMock({
    seasons: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        activity_plan_id: PLAN_ID,
        name: 'Late year',
        start_month: 11,
        start_day: 1,
        end_month: 4,
        end_day: 30,
        timezone: 'Asia/Taipei',
        is_active: true,
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        activity_plan_id: PLAN_ID,
        name: 'Spring',
        start_month: 3,
        start_day: 1,
        end_month: 6,
        end_day: 30,
        timezone: 'Asia/Taipei',
        is_active: true,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        activity_plan_id: OTHER_PLAN_ID,
        name: 'Other plan',
        start_month: 1,
        start_day: 1,
        end_month: 12,
        end_day: 31,
        timezone: 'Asia/Taipei',
        is_active: true,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    ],
  });
  db.__setSupabaseClientForTest(supabase);

  try {
    const response = await route.GET(new Request(routeUrl('/api/v2/admin/activities/test/plans/test/seasons')), {
      params: Promise.resolve({ activityId: ACTIVITY_ID, planId: PLAN_ID }),
    });
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.success, true);
    assert.deepEqual(
      body.data.seasons.map((row) => row.name),
      ['Spring', 'Late year']
    );
    assert.equal(body.data.seasons.every((row) => row.activity_plan_id === undefined), true);
    assert.equal(body.data.seasons[0].id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  } finally {
    db.__setSupabaseClientForTest(null);
  }
});

test('GH-1067 RED: POST creates cross-year season with Asia/Taipei + active defaults', async () => {
  const db = await importDbModule();
  const route = await importSeasonsRoute();
  const supabase = createSupabaseMock();
  db.__setSupabaseClientForTest(supabase);

  try {
    const response = await route.POST(
      new Request(routeUrl('/api/v2/admin/activities/test/plans/test/seasons'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Winter',
          start_month: 11,
          start_day: 1,
          end_month: 4,
          end_day: 30,
        }),
      }),
      { params: Promise.resolve({ activityId: ACTIVITY_ID, planId: PLAN_ID }) }
    );
    assert.equal(response.status, 201);
    const body = await readJson(response);
    assert.equal(body.data.season.name, 'Winter');
    assert.equal(body.data.season.timezone, 'Asia/Taipei');
    assert.equal(body.data.season.is_active, true);
    assert.deepEqual(supabase.state.inserts[0], {
      activity_plan_id: PLAN_ID,
      name: 'Winter',
      start_month: 11,
      start_day: 1,
      end_month: 4,
      end_day: 30,
      timezone: 'Asia/Taipei',
      is_active: true,
    });
  } finally {
    db.__setSupabaseClientForTest(null);
  }
});

test('GH-1067 RED: POST rejects invalid month/day payload before writing', async () => {
  const db = await importDbModule();
  const route = await importSeasonsRoute();
  const supabase = createSupabaseMock();
  db.__setSupabaseClientForTest(supabase);

  try {
    const response = await route.POST(
      new Request(routeUrl('/api/v2/admin/activities/test/plans/test/seasons'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Broken',
          start_month: 2,
          start_day: 30,
          end_month: 4,
          end_day: 31,
        }),
      }),
      { params: Promise.resolve({ activityId: ACTIVITY_ID, planId: PLAN_ID }) }
    );
    assert.equal(response.status, 400);
    const body = await readJson(response);
    assert.equal(body.success, false);
    assert.equal(supabase.state.inserts.length, 0);
  } finally {
    db.__setSupabaseClientForTest(null);
  }
});

test('GH-1067 RED: PUT updates only the selected plan season and keeps plan scope', async () => {
  const db = await importDbModule();
  const route = await importSeasonItemRoute();
  const supabase = createSupabaseMock({
    seasons: [
      {
        id: SEASON_ID,
        activity_plan_id: PLAN_ID,
        name: 'Winter',
        start_month: 11,
        start_day: 1,
        end_month: 4,
        end_day: 30,
        timezone: 'Asia/Taipei',
        is_active: true,
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
    ],
  });
  db.__setSupabaseClientForTest(supabase);

  try {
    const response = await route.PUT(
      new Request(routeUrl('/api/v2/admin/activities/test/plans/test/seasons/test'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Winter Extended',
          end_month: 5,
          end_day: 15,
          is_active: false,
        }),
      }),
      { params: Promise.resolve({ activityId: ACTIVITY_ID, planId: PLAN_ID, seasonId: SEASON_ID }) }
    );
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.data.season.name, 'Winter Extended');
    assert.equal(body.data.season.end_month, 5);
    assert.equal(body.data.season.is_active, false);
    assert.deepEqual(supabase.state.updates[0].filters, {
      id: SEASON_ID,
      activity_plan_id: PLAN_ID,
    });
  } finally {
    db.__setSupabaseClientForTest(null);
  }
});

test('GH-1067 RED: PUT rejects partial month/day updates that become invalid against the existing season row', async () => {
  const db = await importDbModule();
  const route = await importSeasonItemRoute();
  const supabase = createSupabaseMock({
    seasons: [
      {
        id: SEASON_ID,
        activity_plan_id: PLAN_ID,
        name: 'February window',
        start_month: 2,
        start_day: 15,
        end_month: 2,
        end_day: 28,
        timezone: 'Asia/Taipei',
        is_active: true,
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
    ],
  });
  db.__setSupabaseClientForTest(supabase);

  try {
    const response = await route.PUT(
      new Request(routeUrl('/api/v2/admin/activities/test/plans/test/seasons/test'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_day: 31 }),
      }),
      { params: Promise.resolve({ activityId: ACTIVITY_ID, planId: PLAN_ID, seasonId: SEASON_ID }) }
    );
    assert.equal(response.status, 400);
    const body = await readJson(response);
    assert.equal(body.success, false);
    assert.match(body.error.message, /Invalid start month\/day bounds/);
    assert.equal(supabase.state.updates.length, 0);
    assert.equal(supabase.state.seasons[0].start_day, 15);
  } finally {
    db.__setSupabaseClientForTest(null);
  }
});

test('GH-1067 RED: DELETE disables the season instead of deleting it', async () => {
  const db = await importDbModule();
  const route = await importSeasonItemRoute();
  const supabase = createSupabaseMock({
    seasons: [
      {
        id: SEASON_ID,
        activity_plan_id: PLAN_ID,
        name: 'Winter',
        start_month: 11,
        start_day: 1,
        end_month: 4,
        end_day: 30,
        timezone: 'Asia/Taipei',
        is_active: true,
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
    ],
  });
  db.__setSupabaseClientForTest(supabase);

  try {
    const response = await route.DELETE(new Request(routeUrl('/api/v2/admin/activities/test/plans/test/seasons/test'), {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ activityId: ACTIVITY_ID, planId: PLAN_ID, seasonId: SEASON_ID }),
    });
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.data.season.is_active, false);
    assert.equal(supabase.state.seasons[0].is_active, false);
  } finally {
    db.__setSupabaseClientForTest(null);
  }
});

test('GH-1067 RED: PUT returns not found when plan/activity mismatch is invalid', async () => {
  const db = await importDbModule();
  const route = await importSeasonItemRoute();
  const supabase = createSupabaseMock({ planExists: false });
  db.__setSupabaseClientForTest(supabase);

  try {
    const response = await route.PUT(
      new Request(routeUrl('/api/v2/admin/activities/test/plans/test/seasons/test'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nope' }),
      }),
      { params: Promise.resolve({ activityId: ACTIVITY_ID, planId: PLAN_ID, seasonId: SEASON_ID }) }
    );
    assert.equal(response.status, 404);
    assert.equal(supabase.state.updates.length, 0);
  } finally {
    db.__setSupabaseClientForTest(null);
  }
});
