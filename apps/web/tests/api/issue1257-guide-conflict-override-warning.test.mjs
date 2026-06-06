/**
 * GH-1257 Slice D: Guide booking warning for admin conflict override/helper metadata
 *
 * RED tests: verify the guide bookings API currently lacks conflict_override fields
 *            and the UI source lacks warning copy.
 * GREEN tests: verify the implementation exposes guide-safe override fields only
 *              and that adminNote is never included.
 *
 * Bounded command:
 *   cd apps/web && NODE_OPTIONS=--max-old-space-size=768 timeout 120s \
 *     node --test --test-concurrency=1 tests/api/issue1257-guide-conflict-override-warning.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const LIST_ROUTE_PATH = path.resolve(ROOT, 'app/api/guide/bookings/route.ts');
const DETAIL_ROUTE_PATH = path.resolve(ROOT, 'app/api/guide/bookings/[bookingId]/route.ts');
const PAGE_PATH = path.resolve(ROOT, 'app/guide/bookings/page.tsx');

// ─── Test fixtures ────────────────────────────────────────────────────────────

const GUIDE_ID = 'guide-aaa-0001';
const ACTIVITY_ID = 'activity-bbb-0001';
const ORDER_ID = 'order-ccc-0001';
const BOOKING_ID = 'booking-ddd-0001';
const SCHEDULE_ID = 'schedule-eee-0001';

const MOCK_OVERRIDE_SNAPSHOT = {
  overrideId: 'ovr-fff-0001',
  reason: 'VIP 客訴補救，核准開放此衝突時段',
  requiresHelper: true,
  helperStatus: 'required',
  guideNote: '導遊已知悉需協調半日衝突',
  adminNote: '後台主管核准 — 內部備注勿外露',   // must NOT appear in guide response
  startAt: '2030-04-12T09:00:00+08:00',
  endAt: '2030-04-12T12:00:00+08:00',
};

const MOCK_ORDER = {
  id: ORDER_ID,
  contact_name: '測試旅客',
  contact_email: 'traveler@example.com',
  contact_phone: '0912345678',
  people_count: 2,
  status: 'confirmed',
  total_twd: 3600,
  paid_at: '2030-04-01T10:00:00.000Z',
  created_at: '2030-03-28T10:00:00.000Z',
  admin_note: null,
  activity_id: ACTIVITY_ID,
  schedule_id: SCHEDULE_ID,
  booking_id: BOOKING_ID,
  activity_schedules: {
    start_at: '2030-04-12T09:00:00+08:00',
    end_at: '2030-04-12T12:00:00+08:00',
    plan_id: 'plan-001',
    capacity: 6,
    booked_count: 2,
  },
};

const MOCK_BOOKING_WITH_OVERRIDE = {
  id: BOOKING_ID,
  order_id: ORDER_ID,
  conflict_override_id: 'ovr-fff-0001',
  conflict_override_snapshot: MOCK_OVERRIDE_SNAPSHOT,
};

const MOCK_BOOKING_NO_OVERRIDE = {
  id: BOOKING_ID,
  order_id: ORDER_ID,
  conflict_override_id: null,
  conflict_override_snapshot: null,
};

async function importListRoute() {
  return import(`${pathToFileURL(LIST_ROUTE_PATH).href}?t=${Date.now()}`);
}

async function importDetailRoute() {
  return import(`${pathToFileURL(DETAIL_ROUTE_PATH).href}?t=${Date.now()}`);
}

async function importDbModule() {
  const dbPath = path.resolve(ROOT, 'src/lib/db.mjs');
  return import(pathToFileURL(dbPath).href);
}

// ─── Supabase mock factory ─────────────────────────────────────────────────────

function createSupabaseMock({ withOverride = false } = {}) {
  const state = {
    activities: [{ id: ACTIVITY_ID, guide_id: GUIDE_ID, title: '測試行程' }],
    orders: [{ ...MOCK_ORDER }],
    bookings: [withOverride ? { ...MOCK_BOOKING_WITH_OVERRIDE } : { ...MOCK_BOOKING_NO_OVERRIDE }],
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

  function makeSelectApi(table, filters = []) {
    let columns = '*';
    const api = {
      select(cols) {
        columns = cols;
        return api;
      },
      eq(column, value) {
        return makeSelectApi(table, [...filters, { type: 'eq', column, value }]);
      },
      in(column, value) {
        return makeSelectApi(table, [...filters, { type: 'in', column, value }]);
      },
      order() { return api; },
      limit() { return api; },
      single() {
        const rows = applyFilters(state[table] || [], filters);
        const row = rows[0] ?? null;
        return Promise.resolve(
          row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'not found' } }
        );
      },
      then(resolve, reject) {
        return Promise.resolve({ data: applyFilters(state[table] || [], filters), error: null }).then(resolve, reject);
      },
    };
    return api;
  }

  return {
    state,
    from(table) {
      return makeSelectApi(table);
    },
  };
}

function makeGuideRequest(url = 'https://example.test/api/guide/bookings') {
  return new Request(url, {
    headers: {
      cookie: `guide_token=test-token; guide_id=${GUIDE_ID}`,
    },
  });
}

// ─── RED: Source-contract tests (always pass — these verify existing API shape) ─

test('GH-1257 source-contract: list route does NOT select conflict_override fields (RED baseline)', () => {
  const src = readFileSync(LIST_ROUTE_PATH, 'utf8');
  // RED: these fields must NOT appear yet in the list route
  assert.doesNotMatch(
    src,
    /conflict_override_id|conflict_override_snapshot/,
    'List route should not have conflict_override fields yet — add them in the implementation',
  );
});

test('GH-1257 source-contract: detail route does NOT select conflict_override fields (RED baseline)', () => {
  const src = readFileSync(DETAIL_ROUTE_PATH, 'utf8');
  assert.doesNotMatch(
    src,
    /conflict_override_id|conflict_override_snapshot/,
    'Detail route should not have conflict_override fields yet — add them in the implementation',
  );
});

test('GH-1257 source-contract: guide bookings page has no conflict override warning copy (RED baseline)', () => {
  const src = readFileSync(PAGE_PATH, 'utf8');
  assert.doesNotMatch(
    src,
    /管理者例外開放|時間衝突|需要助手/,
    'Page should not have conflict override warning UI yet — add it in the implementation',
  );
});

// ─── GREEN: Source-contract tests (run after implementation) ──────────────────

test('GH-1257 GREEN source-contract: detail route selects bookings join with conflict_override_snapshot', () => {
  const src = readFileSync(DETAIL_ROUTE_PATH, 'utf8');
  // After implementation these must exist
  assert.match(src, /conflict_override_snapshot/, 'Detail route must select conflict_override_snapshot');
  // The extractGuideConflictOverride helper must not forward snapshot.adminNote.
  // We check that the snapshot field is not accessed (snapshot.adminNote) within the helper.
  // Note: order.adminNote is a separate, legitimate order-level field; we only guard the snapshot field.
  assert.doesNotMatch(
    src,
    /snapshot\s*\.\s*adminNote/,
    'Detail route must not access snapshot.adminNote — guide-safe fields only from extractGuideConflictOverride',
  );
});

test('GH-1257 GREEN source-contract: list route selects bookings join for hasConflictOverride marker', () => {
  const src = readFileSync(LIST_ROUTE_PATH, 'utf8');
  assert.match(src, /conflict_override_snapshot|hasConflictOverride/, 'List route must carry conflict override marker');
});

test('GH-1257 GREEN source-contract: page renders 管理者例外開放 warning copy when conflictOverride present', () => {
  const src = readFileSync(PAGE_PATH, 'utf8');
  assert.match(src, /管理者例外開放/, 'Page must contain 管理者例外開放 warning label');
  assert.match(src, /時間衝突/, 'Page must contain 時間衝突 label');
  assert.match(src, /需要助手/, 'Page must contain 需要助手 label');
});

test('GH-1257 GREEN source-contract: page does NOT expose snapshot adminNote as a guide-visible field', () => {
  const src = readFileSync(PAGE_PATH, 'utf8');
  // The conflict override snapshot's adminNote must NOT be rendered in the guide-visible warning section.
  // The ConflictOverrideWarning component must not access override.adminNote.
  // We look for the specific pattern of accessing adminNote on the override prop.
  assert.doesNotMatch(
    src,
    /override\.adminNote/,
    'Page must not render override.adminNote — guide-safe fields only',
  );
  // Also must not forward adminNote in JSX text/value position
  assert.doesNotMatch(
    src,
    /\{[^}]*\.adminNote[^}]*\}.*(?:admin|內部)/,
    'Page must not render adminNote from conflict override snapshot to guide-visible UI',
  );
});

test('GH-1257 GREEN privacy: guide detail response mapping must not include adminNote from snapshot', () => {
  const src = readFileSync(DETAIL_ROUTE_PATH, 'utf8');
  // The response mapping should not forward snapshot.adminNote
  assert.doesNotMatch(
    src,
    /conflictOverride[^;{]*adminNote/,
    'Detail route must strip adminNote when building conflictOverride response object',
  );
});
