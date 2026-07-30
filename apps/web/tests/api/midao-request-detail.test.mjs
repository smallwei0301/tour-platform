import assert from 'node:assert/strict';
import test from 'node:test';

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_ID = '44444444-4444-4444-8444-444444444444';
const GUIDE_SESSION_SECRET = 'task16-detail-api-test-guide-session-secret-0123456789';

process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;

const { createGuideSessionCookies } = await import('../../src/lib/guide-auth.ts');
const { __setSupabaseClientForTest } = await import('../../src/lib/supabase-env.mjs');

let routeModule = {};
let routeImportError = null;
try {
  routeModule = await import('../../app/api/v2/guide/requests/[requestRef]/route.ts');
} catch (error) {
  routeImportError = error;
}
const { GET } = routeModule;

const originalEnv = {
  MIDAO_BACKEND_ENABLED: process.env.MIDAO_BACKEND_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function cookieHeader(cookies) {
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

function guideCookieHeader() {
  return cookieHeader(createGuideSessionCookies(GUIDE_ID, 'Cookie Guide Name', 7));
}

function requestFor() {
  return new Request('https://example.test/api/v2/guide/requests/detail', {
    headers: { cookie: guideCookieHeader() },
  });
}

function responsePayload(response) {
  return response.json().then((body) => ({ status: response.status, body }));
}

function assertForbiddenKeysAbsent(value) {
  const forbidden = new Set(['admin_note', 'adminNote', 'internal_note', 'internalNote', 'body']);
  const visit = (current) => {
    if (!current || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current)) {
      assert.equal(forbidden.has(key), false, `forbidden key leaked: ${key}`);
      visit(child);
    }
  };
  visit(value);
}

function bookingRow({ guideId = GUIDE_ID, bookingId = BOOKING_ID, orderId = ORDER_ID } = {}) {
  return {
    id: bookingId,
    booking_no: 'BK-1111',
    guide_id: guideId,
    order_id: orderId,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    status: 'draft',
    guide_approval_status: 'pending',
    guide_approval_decided_at: null,
    guide_approval_note: null,
    start_at: '2026-08-01T02:00:00.000Z',
    end_at: '2026-08-01T06:00:00.000Z',
    timezone: 'Asia/Taipei',
    participants: 2,
    customer_note: '需要低強度路線',
    internal_note: 'MUST_NOT_LEAK',
    created_at: '2026-07-28T00:00:00.000Z',
    updated_at: '2026-07-28T00:00:00.000Z',
    activities: { id: ACTIVITY_ID, title: '島嶼散步' },
    activity_plans: { id: PLAN_ID, name: '半日方案', booking_type: 'request' },
    orders: {
      id: orderId,
      booking_id: bookingId,
      status: 'pending_payment',
      total_twd: 3600,
      contact_name: '王小明',
      contact_email: 'traveler@example.com',
      contact_phone: '0912345678',
      payment_deadline_at: '2026-07-29T00:15:00.000Z',
      created_at: '2026-07-28T00:00:00.000Z',
      updated_at: '2026-07-28T00:00:00.000Z',
      admin_note: 'MUST_NOT_LEAK',
      order_messages: [],
    },
  };
}

function createSupabaseFake({ detailRow = bookingRow(), detailError = null, runtimeBackendMode = 'midao' } = {}) {
  const calls = [];
  const client = {
    from(table) {
      const state = { rows: detailRow ? [detailRow] : [] };
      const query = {
        select(columns) {
          calls.push({ type: 'select', table, columns });
          return query;
        },
        eq(field, value) {
          calls.push({ type: 'eq', table, field, value });
          if (table === 'bookings') {
            state.rows = state.rows.filter((row) => {
              if (field === 'guide_id') return row.guide_id === value;
              if (field === 'id') return row.id === value;
              if (field === 'activity_plans.booking_type') return row.activity_plans?.booking_type === value;
              return true;
            });
          }
          return query;
        },
        async single() {
          assert.equal(table, 'guide_profiles');
          return {
            data: {
              id: GUIDE_ID,
              display_name: 'DB Canonical Name',
              backend_mode: runtimeBackendMode,
              guide_session_version: 7,
              verification_status: 'approved',
            },
            error: null,
          };
        },
        async maybeSingle() {
          assert.equal(table, 'bookings');
          if (detailError) return { data: null, error: { message: detailError } };
          return { data: state.rows[0] ?? null, error: null };
        },
      };
      return query;
    },
    async rpc() {
      calls.push({ type: 'rpc' });
      return { data: [], error: null };
    },
  };
  return { client, calls };
}

function installTestEnvironment(fake) {
  process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;
  process.env.MIDAO_BACKEND_ENABLED = '1';
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(fake.client);
}

function restoreTestEnvironment() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete process.env.GUIDE_SESSION_SECRET;
  __setSupabaseClientForTest(null);
}

async function getDetail(requestRef, fake, { authenticated = true } = {}) {
  installTestEnvironment(fake);
  const request = authenticated
    ? requestFor()
    : new Request('https://example.test/api/v2/guide/requests/detail');
  return GET(request, { params: Promise.resolve({ requestRef }) });
}

test.beforeEach(() => {
  installTestEnvironment(createSupabaseFake());
});

test.afterEach(restoreTestEnvironment);

test('Requests detail route must export GET', () => {
  assert.equal(typeof GET, 'function', routeImportError
    ? `Requests detail route import failed: ${routeImportError.message}`
    : 'Requests detail route must export GET');
});

test('unauthorized detail GET wins over invalid requestRef and never reaches runtime or gateway', async () => {
  const fake = createSupabaseFake();
  const response = await getDetail('not-a-request-ref', fake, { authenticated: false });
  const payload = await responsePayload(response);

  assert.deepEqual(payload, {
    status: 401,
    body: { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
  });
  assert.equal(fake.calls.some((call) => call.table === 'guide_profiles'), false);
  assert.equal(fake.calls.some((call) => call.table === 'bookings'), false);
});

test('legacy canonical runtime mode returns 409 before invalid requestRef reaches detail gateway', async () => {
  const fake = createSupabaseFake({ runtimeBackendMode: 'legacy' });
  const response = await getDetail('not-a-request-ref', fake);
  const payload = await responsePayload(response);

  assert.deepEqual(payload, {
    status: 409,
    body: { success: false, error: { code: 'BACKEND_MODE_MISMATCH', message: 'Guide backend mode conflict' } },
  });
  assert.equal(fake.calls.some((call) => call.table === 'bookings'), false);
});

test('valid booking ref dispatches only parsed booking id, returns detail actions, and omits internal notes', async () => {
  const fake = createSupabaseFake();
  const response = await getDetail(`booking_${BOOKING_ID}`, fake);
  const payload = await responsePayload(response);

  assert.equal(payload.status, 200);
  assert.equal(payload.body.success, true);
  assert.equal(payload.body.data.bookingId, BOOKING_ID);
  assert.equal(payload.body.data.orderId, ORDER_ID);
  assert.notEqual(payload.body.data.bookingId, payload.body.data.orderId);
  assert.deepEqual(payload.body.data.allowedActions, {
    approve: true,
    reject: true,
    markReplied: false,
    convertInquiry: false,
  });
  assertForbiddenKeysAbsent(payload.body);
  assert.equal(fake.calls.some((call) => call.type === 'rpc'), false);
  assert.equal(fake.calls.filter((call) => call.table === 'bookings').length > 0, true);
  assert.equal(fake.calls.some((call) => call.table === 'inquiries'), false);
  assert.equal(fake.calls.some((call) => call.field === 'id' && call.value === BOOKING_ID), true);
});

test('raw UUID, order ref, unknown prefix, malformed UUID, padding, and extra path all return 422', async () => {
  const invalidRefs = [
    BOOKING_ID,
    `order_${BOOKING_ID}`,
    `unknown_${BOOKING_ID}`,
    'booking_not-a-uuid',
    ` booking_${BOOKING_ID}`,
    `booking_${BOOKING_ID} `,
    `booking_${BOOKING_ID}/child`,
  ];

  for (const requestRef of invalidRefs) {
    const fake = createSupabaseFake();
    const response = await getDetail(requestRef, fake);
    const payload = await responsePayload(response);
    assert.equal(payload.status, 422, requestRef);
    assert.deepEqual(payload.body.error, {
      code: 'INVALID_REQUEST_REF',
      message: 'Invalid request reference',
    }, requestRef);
    assert.equal(fake.calls.some((call) => call.table === 'bookings'), false, requestRef);
    assert.equal(fake.calls.some((call) => call.type === 'rpc'), false, requestRef);
  }
});

test('missing and wrong-owner booking details collapse to the same sanitized 404', async () => {
  const missing = createSupabaseFake({ detailRow: null });
  const wrongOwner = createSupabaseFake({ detailRow: bookingRow({ guideId: OTHER_GUIDE_ID }) });
  const missingPayload = await responsePayload(await getDetail(`booking_${BOOKING_ID}`, missing));
  const wrongOwnerPayload = await responsePayload(await getDetail(`booking_${BOOKING_ID}`, wrongOwner));

  assert.deepEqual(missingPayload, {
    status: 404,
    body: { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } },
  });
  assert.deepEqual(wrongOwnerPayload, missingPayload);
});

test('valid inquiry ref calls only inquiry gateway and returns deterministic 404 without booking fallback', async () => {
  const fake = createSupabaseFake();
  const response = await getDetail('inquiry_11111111-1111-4111-8111-111111111111', fake);
  const payload = await responsePayload(response);

  assert.deepEqual(payload, {
    status: 404,
    body: { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } },
  });
  assert.equal(fake.calls.some((call) => call.table === 'bookings'), false);
  assert.equal(fake.calls.some((call) => call.type === 'rpc'), false);
});

test('unexpected detail backend errors become sanitized 500 responses', async () => {
  const fake = createSupabaseFake({ detailError: 'database password MUST_NOT_LEAK' });
  const response = await getDetail(`booking_${BOOKING_ID}`, fake);
  const payload = await responsePayload(response);

  assert.deepEqual(payload, {
    status: 500,
    body: { success: false, error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' } },
  });
  assert.doesNotMatch(JSON.stringify(payload.body), /password|MUST_NOT_LEAK/iu);
});
