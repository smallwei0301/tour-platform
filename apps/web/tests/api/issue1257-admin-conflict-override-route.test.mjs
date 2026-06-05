import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const ROUTE_PATH = path.resolve(
  ROOT,
  'app/api/v2/admin/guides/[guideId]/conflict-overrides/route.ts',
);

const GUIDE_ID = '11111111-1111-4111-8111-111111111111';
const ACTIVITY_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const START_AT = '2030-04-12T09:00:00+08:00';
const END_AT = '2030-04-12T12:00:00+08:00';
const ADMIN_TOKEN = 'admin-token-123';
const ADMIN_EMAIL = 'admin@example.com';
const CSRF = 'csrf-token-123';

function routeUrl() {
  return `https://example.test/api/v2/admin/guides/${GUIDE_ID}/conflict-overrides`;
}

async function importRoute() {
  return import(`${pathToFileURL(ROUTE_PATH).href}?t=${Date.now()}`);
}

async function importDbModule() {
  return import(pathToFileURL(path.resolve(ROOT, 'src/lib/db.mjs')).href);
}

function buildCookieHeader({
  includeAuth = true,
  includeCsrf = true,
} = {}) {
  const parts = [];
  if (includeAuth) {
    parts.push(`admin_token=${encodeURIComponent(ADMIN_TOKEN)}`);
    parts.push(`admin_email=${encodeURIComponent(ADMIN_EMAIL)}`);
    parts.push('admin_session_version=1');
    parts.push(`admin_session_expires_at=${encodeURIComponent('2035-01-01T00:00:00.000Z')}`);
  }
  if (includeCsrf) {
    parts.push(`tp_csrf=${encodeURIComponent(CSRF)}`);
  }
  return parts.join('; ');
}

function createRequest(body, { includeAuth = true, includeCsrf = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  const cookie = buildCookieHeader({ includeAuth, includeCsrf });
  if (cookie) {
    headers.cookie = cookie;
  }
  if (includeCsrf) {
    headers['x-csrf-token'] = CSRF;
  }
  return new Request(routeUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function createSupabaseMock({ duplicate = null, bookings = [] } = {}) {
  const state = {
    inserts: [],
    guide: { id: GUIDE_ID },
    activity: { id: ACTIVITY_ID, guide_id: GUIDE_ID },
    plan: { id: PLAN_ID, activity_id: ACTIVITY_ID },
    duplicate: duplicate ? { ...duplicate } : null,
    bookings: bookings.map((row) => ({ ...row })),
  };

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every(({ type, column, value }) => {
        if (type === 'eq') return row[column] === value;
        if (type === 'in') return value.includes(row[column]);
        return true;
      }),
    );
  }

  function selectRows(table, filters, expectSingle) {
    if (table === 'guide_profiles') {
      const rows = applyFilters([state.guide], filters);
      const row = rows[0] ?? null;
      return expectSingle
        ? row
          ? { data: { ...row }, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'not found' } }
        : { data: rows.map((row) => ({ ...row })), error: null };
    }

    if (table === 'activities') {
      const rows = applyFilters([state.activity], filters);
      const row = rows[0] ?? null;
      return expectSingle
        ? row
          ? { data: { ...row }, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'not found' } }
        : { data: rows.map((row) => ({ ...row })), error: null };
    }

    if (table === 'activity_plans') {
      const rows = applyFilters([state.plan], filters);
      const row = rows[0] ?? null;
      return expectSingle
        ? row
          ? { data: { ...row }, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'not found' } }
        : { data: rows.map((row) => ({ ...row })), error: null };
    }

    if (table === 'bookings') {
      const rows = applyFilters(state.bookings, filters);
      return expectSingle
        ? rows[0]
          ? { data: { ...rows[0] }, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'not found' } }
        : { data: rows.map((row) => ({ ...row })), error: null };
    }

    if (table === 'guide_slot_conflict_overrides') {
      const rows = applyFilters(state.duplicate ? [state.duplicate] : [], filters);
      return expectSingle
        ? rows[0]
          ? { data: { ...rows[0] }, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'not found' } }
        : { data: rows.map((row) => ({ ...row })), error: null };
    }

    return expectSingle
      ? { data: null, error: { code: 'PGRST116', message: `unsupported table ${table}` } }
      : { data: [], error: null };
  }

  function createSelectQuery(table, filters = []) {
    const api = {
      select() {
        return api;
      },
      eq(column, value) {
        return createSelectQuery(table, [...filters, { type: 'eq', column, value }]);
      },
      in(column, value) {
        return createSelectQuery(table, [...filters, { type: 'in', column, value }]);
      },
      maybeSingle() {
        return Promise.resolve(selectRows(table, filters, true));
      },
      single() {
        return Promise.resolve(selectRows(table, filters, true));
      },
      then(resolve, reject) {
        return Promise.resolve(selectRows(table, filters, false)).then(resolve, reject);
      },
    };
    return api;
  }

  return {
    state,
    from(table) {
      if (table === 'guide_slot_conflict_overrides') {
        return {
          ...createSelectQuery(table),
          insert(payload) {
            state.inserts.push({ ...payload });
            const inserted = {
              id: 'override-new',
              status: 'active',
              created_at: '2026-06-05T10:00:00.000Z',
              ...payload,
            };
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: inserted, error: null });
                  },
                };
              },
            };
          },
        };
      }
      return createSelectQuery(table);
    },
  };
}

function validBody(overrides = {}) {
  return {
    activityId: ACTIVITY_ID,
    activityPlanId: PLAN_ID,
    startAt: START_AT,
    endAt: END_AT,
    reason: 'VIP 客訴補救，核准開放此衝突時段',
    requiresHelper: true,
    helperStatus: 'required',
    guideNote: '導遊已知悉需協調半日衝突',
    adminNote: '後台主管核准',
    ...overrides,
  };
}

function activeConflictBooking(overrides = {}) {
  return {
    id: 'booking-conflict-1',
    guide_id: GUIDE_ID,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    start_at: '2030-04-12T08:00:00+08:00',
    end_at: '2030-04-12T17:00:00+08:00',
    status: 'confirmed',
    participants: 2,
    ...overrides,
  };
}

test('GH-1257 RED: route source contract enforces admin auth + csrf + override insert flow', async () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /validateCsrf/);
  assert.match(src, /pickAdminCredentials/);
  assert.match(src, /isAdminAuthorized/);
  assert.match(src, /guide_slot_conflict_overrides/);
  assert.match(src, /created_by_admin_email/);
  assert.match(src, /helper_status/);
});

test('GH-1257 RED: POST rejects missing CSRF before DB mutation', async () => {
  const db = await importDbModule();
  const supabase = createSupabaseMock({ bookings: [activeConflictBooking()] });
  db.__setSupabaseClientForTest(supabase);
  process.env.ADMIN_ACCESS_TOKEN = ADMIN_TOKEN;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;

  try {
    const route = await importRoute();
    const response = await route.POST(createRequest(validBody(), { includeCsrf: false }), {
      params: Promise.resolve({ guideId: GUIDE_ID }),
    });
    const json = await response.json();

    assert.equal(response.status, 403);
    assert.equal(json?.error?.code, 'CSRF_REQUIRED');
    assert.equal(supabase.state.inserts.length, 0);
  } finally {
    db.__setSupabaseClientForTest(null);
    delete process.env.ADMIN_ACCESS_TOKEN;
    delete process.env.ADMIN_EMAIL_ALLOWLIST;
  }
});

test('GH-1257 RED: POST rejects unauthenticated request with deterministic 401 and no DB mutation', async () => {
  const db = await importDbModule();
  const supabase = createSupabaseMock({ bookings: [activeConflictBooking()] });
  db.__setSupabaseClientForTest(supabase);
  process.env.ADMIN_ACCESS_TOKEN = ADMIN_TOKEN;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;

  try {
    const route = await importRoute();
    const response = await route.POST(createRequest(validBody(), { includeAuth: false }), {
      params: Promise.resolve({ guideId: GUIDE_ID }),
    });
    const json = await response.json();

    assert.equal(response.status, 401);
    assert.equal(json?.error?.code, 'UNAUTHORIZED');
    assert.equal(supabase.state.inserts.length, 0);
  } finally {
    db.__setSupabaseClientForTest(null);
    delete process.env.ADMIN_ACCESS_TOKEN;
    delete process.env.ADMIN_EMAIL_ALLOWLIST;
  }
});

test('GH-1257 RED: invalid required fields return 400 and do not mutate DB', async () => {
  const db = await importDbModule();
  const supabase = createSupabaseMock({ bookings: [activeConflictBooking()] });
  db.__setSupabaseClientForTest(supabase);
  process.env.ADMIN_ACCESS_TOKEN = ADMIN_TOKEN;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;

  try {
    const route = await importRoute();
    const response = await route.POST(createRequest(validBody({ reason: '   ', helperStatus: 'invalid' })), {
      params: Promise.resolve({ guideId: GUIDE_ID }),
    });
    const json = await response.json();

    assert.equal(response.status, 400);
    assert.equal(json?.error?.code, 'VALIDATION_ERROR');
    assert.equal(supabase.state.inserts.length, 0);
  } finally {
    db.__setSupabaseClientForTest(null);
    delete process.env.ADMIN_ACCESS_TOKEN;
    delete process.env.ADMIN_EMAIL_ALLOWLIST;
  }
});

test('GH-1257 RED: creates exact active override with helper/admin metadata when slot is blocked by booking conflict', async () => {
  const db = await importDbModule();
  const supabase = createSupabaseMock({ bookings: [activeConflictBooking()] });
  db.__setSupabaseClientForTest(supabase);
  process.env.ADMIN_ACCESS_TOKEN = ADMIN_TOKEN;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;

  try {
    const route = await importRoute();
    const response = await route.POST(createRequest(validBody()), {
      params: Promise.resolve({ guideId: GUIDE_ID }),
    });
    const json = await response.json();

    assert.equal(response.status, 201);
    assert.equal(supabase.state.inserts.length, 1);
    assert.deepEqual(supabase.state.inserts[0], {
      guide_id: GUIDE_ID,
      activity_id: ACTIVITY_ID,
      activity_plan_id: PLAN_ID,
      start_at: START_AT,
      end_at: END_AT,
      reason: 'VIP 客訴補救，核准開放此衝突時段',
      requires_helper: true,
      helper_status: 'required',
      guide_note: '導遊已知悉需協調半日衝突',
      admin_note: '後台主管核准',
      status: 'active',
      created_by_admin_email: ADMIN_EMAIL,
    });
    assert.equal(json?.data?.override?.id, 'override-new');
    assert.equal(json?.data?.duplicate, false);
  } finally {
    db.__setSupabaseClientForTest(null);
    delete process.env.ADMIN_ACCESS_TOKEN;
    delete process.env.ADMIN_EMAIL_ALLOWLIST;
  }
});

test('GH-1257 RED: cross-activity overlapping active booking for same guide still creates override for requested target slot', async () => {
  const db = await importDbModule();
  const supabase = createSupabaseMock({
    bookings: [
      activeConflictBooking({
        activity_id: '44444444-4444-4444-8444-444444444444',
        activity_plan_id: '55555555-5555-4555-8555-555555555555',
      }),
    ],
  });
  db.__setSupabaseClientForTest(supabase);
  process.env.ADMIN_ACCESS_TOKEN = ADMIN_TOKEN;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;

  try {
    const route = await importRoute();
    const response = await route.POST(createRequest(validBody()), {
      params: Promise.resolve({ guideId: GUIDE_ID }),
    });
    const json = await response.json();

    assert.equal(response.status, 201);
    assert.equal(supabase.state.inserts.length, 1);
    assert.deepEqual(supabase.state.inserts[0], {
      guide_id: GUIDE_ID,
      activity_id: ACTIVITY_ID,
      activity_plan_id: PLAN_ID,
      start_at: START_AT,
      end_at: END_AT,
      reason: 'VIP 客訴補救，核准開放此衝突時段',
      requires_helper: true,
      helper_status: 'required',
      guide_note: '導遊已知悉需協調半日衝突',
      admin_note: '後台主管核准',
      status: 'active',
      created_by_admin_email: ADMIN_EMAIL,
    });
    assert.equal(json?.data?.override?.id, 'override-new');
    assert.equal(json?.data?.duplicate, false);
  } finally {
    db.__setSupabaseClientForTest(null);
    delete process.env.ADMIN_ACCESS_TOKEN;
    delete process.env.ADMIN_EMAIL_ALLOWLIST;
  }
});

test('GH-1257 RED: duplicate exact active override returns deterministic existing row instead of inserting again', async () => {
  const db = await importDbModule();
  const duplicate = {
    id: 'override-existing',
    guide_id: GUIDE_ID,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    start_at: START_AT,
    end_at: END_AT,
    reason: '既有例外',
    requires_helper: false,
    helper_status: 'not_needed',
    guide_note: null,
    admin_note: '已存在',
    status: 'active',
    created_at: '2026-06-05T09:00:00.000Z',
    created_by_admin_email: ADMIN_EMAIL,
  };
  const supabase = createSupabaseMock({ duplicate, bookings: [activeConflictBooking()] });
  db.__setSupabaseClientForTest(supabase);
  process.env.ADMIN_ACCESS_TOKEN = ADMIN_TOKEN;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;

  try {
    const route = await importRoute();
    const response = await route.POST(createRequest(validBody()), {
      params: Promise.resolve({ guideId: GUIDE_ID }),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(supabase.state.inserts.length, 0);
    assert.equal(json?.data?.duplicate, true);
    assert.equal(json?.data?.override?.id, 'override-existing');
  } finally {
    db.__setSupabaseClientForTest(null);
    delete process.env.ADMIN_ACCESS_TOKEN;
    delete process.env.ADMIN_EMAIL_ALLOWLIST;
  }
});
