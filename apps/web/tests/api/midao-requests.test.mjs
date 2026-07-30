import assert from 'node:assert/strict';
import test from 'node:test';

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_BOOKING_ID = '11111111-1111-4111-8111-111111111112';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_ORDER_ID = '22222222-2222-4222-8222-222222222223';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_ID = '44444444-4444-4444-8444-444444444444';
const GUIDE_SESSION_SECRET = 'task16-api-test-guide-session-secret-0123456789';

process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;

const { createGuideSessionCookies } = await import('../../src/lib/guide-auth.ts');
const { __setSupabaseClientForTest } = await import('../../src/lib/supabase-env.mjs');

let routeModule = {};
let routeImportError = null;
try {
  routeModule = await import('../../app/api/v2/guide/requests/route.ts');
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

function guideCookieHeader(guideId = GUIDE_ID, version = 7) {
  return cookieHeader(createGuideSessionCookies(guideId, 'Cookie Guide Name', version));
}

function requestFor(url, { authenticated = true } = {}) {
  return new Request(`https://example.test${url}`, {
    headers: authenticated ? { cookie: guideCookieHeader() } : {},
  });
}

function responsePayload(response) {
  return response.json().then((body) => ({ status: response.status, body }));
}

function assertForbiddenKeysAbsent(value) {
  const forbidden = new Set([
    'admin_note',
    'adminNote',
    'internal_note',
    'internalNote',
    'body',
    'contactEmail',
    'contactPhone',
    'customerNote',
  ]);
  const visit = (current) => {
    if (!current || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current)) {
      assert.equal(forbidden.has(key), false, `forbidden key leaked: ${key}`);
      visit(child);
    }
  };
  visit(value);
}

function rpcRow({
  bookingId = BOOKING_ID,
  orderId = ORDER_ID,
  guideId = GUIDE_ID,
  bookingStatus = 'draft',
  guideApprovalStatus = 'pending',
  orderStatus = 'pending_payment',
  bucket = 'new',
  secondaryState = 'pending_approval',
  needsReply = false,
  priorityRank = 1,
  updatedAt = '2026-07-28T00:00:00.000Z',
  startAt = '2026-08-01T02:00:00.000Z',
} = {}) {
  return {
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    activity_title: '島嶼散步',
    booking_id: bookingId,
    booking_no: `BK-${bookingId.slice(-4)}`,
    booking_status: bookingStatus,
    booking_type: 'request',
    bucket,
    display_name: '王小明',
    email_masked: 't***@example.com',
    end_at: '2026-08-01T06:00:00.000Z',
    guide_approval_status: guideApprovalStatus,
    guide_id: guideId,
    last_message_at: null,
    needs_reply: needsReply,
    order_id: orderId,
    order_status: orderStatus,
    party_size: 2,
    payment_deadline_at: '2026-07-29T00:15:00.000Z',
    plan_name: '半日方案',
    priority_rank: priorityRank,
    received_at: '2026-07-28T00:00:00.000Z',
    secondary_state: secondaryState,
    start_at: startAt,
    timezone: 'Asia/Taipei',
    total_twd: 3600,
    updated_at: updatedAt,
  };
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

function createSupabaseFake({
  listRows = [rpcRow()],
  detailRow = bookingRow(),
  listError = null,
  detailError = null,
  runtimeGuideId = GUIDE_ID,
  runtimeBackendMode = 'midao',
} = {}) {
  const calls = [];
  const client = {
    from(table) {
      const state = { table, rows: [detailRow] };
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
              id: runtimeGuideId,
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
    async rpc(name, args) {
      calls.push({ type: 'rpc', name, args: structuredClone(args) });
      assert.equal(name, 'midao_list_booking_requests');
      if (listError) return { data: null, error: { message: listError } };
      let rows = listRows
        .filter((row) => row.guide_id === args.p_guide_id)
        .filter((row) => args.p_bucket === 'all' || row.bucket === args.p_bucket)
        .sort((left, right) => left.priority_rank - right.priority_rank
          || right.updated_at.localeCompare(left.updated_at)
          || right.booking_id.localeCompare(left.booking_id));
      if (args.p_cursor_id !== null) {
        rows = rows.filter((row) => row.priority_rank > args.p_cursor_rank
          || (row.priority_rank === args.p_cursor_rank && (
            row.updated_at < args.p_cursor_at
            || (row.updated_at === args.p_cursor_at && row.booking_id < args.p_cursor_id)
          )));
      }
      return { data: rows.slice(0, args.p_limit), error: null };
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

test.beforeEach(() => {
  installTestEnvironment(createSupabaseFake({
    listRows: [
      rpcRow(),
      rpcRow({
        bookingId: SECOND_BOOKING_ID,
        orderId: SECOND_ORDER_ID,
        guideApprovalStatus: 'approved',
        bucket: 'replied',
        secondaryState: 'awaiting_payment',
        priorityRank: 2,
        updatedAt: '2026-07-28T01:00:00.000Z',
      }),
    ],
  }));
});

test.afterEach(restoreTestEnvironment);

test('Requests list route must export GET', () => {
  assert.equal(typeof GET, 'function', routeImportError
    ? `Requests list route import failed: ${routeImportError.message}`
    : 'Requests list route must export GET');
});

test('unauthorized GET wins over malformed query and never reaches runtime or request gateway', async () => {
  const fake = createSupabaseFake();
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/requests?unknown=x&limit=0', { authenticated: false }));
  const payload = await responsePayload(response);

  assert.deepEqual(payload, {
    status: 401,
    body: { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
  });
  assert.equal(fake.calls.some((call) => call.type === 'rpc'), false);
  assert.equal(fake.calls.some((call) => call.table === 'guide_profiles'), false);
});

test('legacy canonical runtime mode returns 409 before malformed query reaches request gateway', async () => {
  const fake = createSupabaseFake({ runtimeBackendMode: 'legacy' });
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/requests?unknown=x&limit=0'));
  const payload = await responsePayload(response);

  assert.deepEqual(payload, {
    status: 409,
    body: { success: false, error: { code: 'BACKEND_MODE_MISMATCH', message: 'Guide backend mode conflict' } },
  });
  assert.equal(fake.calls.some((call) => call.type === 'rpc'), false);
});

test('valid GET uses canonical guide identity, parses defaults, returns resolver DTO, and omits PII recursively', async () => {
  const fake = createSupabaseFake({ listRows: [rpcRow()] });
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/requests'));
  const payload = await responsePayload(response);

  assert.equal(payload.status, 200);
  assert.equal(payload.body.success, true);
  assert.equal(payload.body.data.items.length, 1);
  assert.equal(payload.body.data.items[0].requestRef, `booking_${BOOKING_ID}`);
  assert.equal(payload.body.data.items[0].bookingId, BOOKING_ID);
  assert.equal(payload.body.data.items[0].orderId, ORDER_ID);
  assert.notEqual(payload.body.data.items[0].bookingId, payload.body.data.items[0].orderId);
  assertForbiddenKeysAbsent(payload.body);

  const rpcCall = fake.calls.find((call) => call.type === 'rpc');
  assert.deepEqual(rpcCall.args, {
    p_guide_id: GUIDE_ID,
    p_bucket: 'all',
    p_sort: 'priority',
    p_cursor_rank: null,
    p_cursor_at: null,
    p_cursor_id: null,
    p_limit: 21,
  });
});

test('valid query values reach gateway unchanged and opaque cursor produces a second page', async () => {
  const fake = createSupabaseFake({
    listRows: [
      rpcRow(),
      rpcRow({
        bookingId: SECOND_BOOKING_ID,
        orderId: SECOND_ORDER_ID,
        guideApprovalStatus: 'approved',
        bucket: 'replied',
        secondaryState: 'awaiting_payment',
        priorityRank: 2,
        updatedAt: '2026-07-28T01:00:00.000Z',
      }),
    ],
  });
  installTestEnvironment(fake);
  const first = await GET(requestFor('/api/v2/guide/requests?bucket=all&sort=priority&limit=1'));
  const firstPayload = await responsePayload(first);
  const cursor = firstPayload.body.data.nextCursor;
  assert.equal(firstPayload.status, 200);
  assert.equal(typeof cursor, 'string');

  const second = await GET(requestFor(`/api/v2/guide/requests?bucket=all&sort=priority&limit=1&cursor=${encodeURIComponent(cursor)}`));
  const secondPayload = await responsePayload(second);
  assert.equal(secondPayload.status, 200);
  assert.deepEqual(secondPayload.body.data.items.map((item) => item.bookingId), [SECOND_BOOKING_ID]);

  const rpcCalls = fake.calls.filter((call) => call.type === 'rpc');
  assert.equal(rpcCalls.length, 2);
  assert.equal(rpcCalls[1].args.p_limit, 2);
});

test('unknown, duplicate, empty, enum, and non-canonical limit queries return 422 before list gateway', async () => {
  const invalidQueries = [
    '?unknown=x',
    '?bucket=all&bucket=new',
    '?bucket=',
    '?cursor=',
    '?limit=',
    '?limit=0',
    '?limit=51',
    '?limit=01',
    '?limit=１',
    '?sort=updated',
  ];

  for (const query of invalidQueries) {
    const fake = createSupabaseFake({ listRows: [rpcRow()] });
    installTestEnvironment(fake);
    const response = await GET(requestFor(`/api/v2/guide/requests${query}`));
    const payload = await responsePayload(response);
    assert.equal(payload.status, 422, query);
    assert.equal(payload.body.error.code, 'INVALID_REQUEST_QUERY', query);
    assert.equal(fake.calls.some((call) => call.type === 'rpc'), false, query);
  }
});

test('invalid or tampered opaque cursor returns 422 without exposing gateway details', async () => {
  const fake = createSupabaseFake({ listRows: [rpcRow()] });
  installTestEnvironment(fake);
  for (const cursor of ['not-a-cursor', ' not-a-cursor ']) {
    const response = await GET(requestFor(`/api/v2/guide/requests?cursor=${encodeURIComponent(cursor)}`));
    const payload = await responsePayload(response);
    assert.equal(payload.status, 422, cursor);
    assert.equal(payload.body.error.code, 'INVALID_CURSOR', cursor);
    assert.doesNotMatch(JSON.stringify(payload.body), /secret|MUST_NOT_LEAK|database/iu);
  }
});

test('unexpected request projection/backend errors become sanitized 500 responses', async () => {
  const fake = createSupabaseFake({ listError: 'database password MUST_NOT_LEAK' });
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/requests'));
  const payload = await responsePayload(response);

  assert.equal(payload.status, 500);
  assert.deepEqual(payload.body, {
    success: false,
    error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' },
  });
  assert.doesNotMatch(JSON.stringify(payload.body), /password|MUST_NOT_LEAK/iu);
});
