import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_ID = '44444444-4444-4444-8444-444444444444';
const MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const GUIDE_SESSION_SECRET = 'task17-api-test-guide-session-secret-0123456789';

process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;

const { createGuideSessionCookies } = await import('../../src/lib/guide-auth.ts');
const { __setSupabaseClientForTest } = await import('../../src/lib/supabase-env.mjs');

let routeModule = {};
let routeImportError = null;
try {
  routeModule = await import('../../app/api/v2/guide/home/route.ts');
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

function messageRow({
  messageId = MESSAGE_ID,
  orderId = ORDER_ID,
  senderRole = 'traveler',
  createdAt = '2026-07-28T00:30:00.000Z',
  guideId = GUIDE_ID,
} = {}) {
  return {
    id: messageId,
    order_id: orderId,
    sender_role: senderRole,
    sender_id: 'sender-secret-must-not-leak',
    body: 'private message body must not leak',
    created_at: createdAt,
    orders: {
      id: orderId,
      status: 'paid',
      schedule_id: '66666666-6666-4666-8666-666666666666',
      contact_name: 'private contact must not leak',
      activity_id: ACTIVITY_ID,
      activities: { id: ACTIVITY_ID, title: '島嶼散步', guide_id: guideId },
      activity_schedules: {
        id: '66666666-6666-4666-8666-666666666666',
        start_at: '2026-08-01T02:00:00.000Z',
        end_at: '2026-08-01T06:00:00.000Z',
      },
    },
  };
}

function indexedUuid(prefix, index) {
  return `${prefix}-${index.toString(16).padStart(12, '0')}`;
}

function createSupabaseFake({
  listRows = [rpcRow()],
  messageRows = [messageRow()],
  listError = null,
  messageError = null,
  runtimeBackendMode = 'midao',
  ignoreCursor = false,
} = {}) {
  const calls = [];
  const client = {
    from(table) {
      const query = {
        select(columns) {
          calls.push({ type: 'select', table, columns });
          return query;
        },
        eq(field, value) {
          calls.push({ type: 'eq', table, field, value });
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
        async order(column, options) {
          calls.push({ type: 'order', table, column, options });
          assert.equal(table, 'order_messages');
          return { data: messageRows, error: messageError ? { message: messageError } : null };
        },
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ type: 'rpc', name, args: structuredClone(args) });
      assert.equal(name, 'midao_list_booking_requests');
      if (listError) return { data: null, error: { message: listError } };
      let rows = [...listRows]
        .filter((row) => row.guide_id === args.p_guide_id)
        .sort((left, right) => left.priority_rank - right.priority_rank
          || right.updated_at.localeCompare(left.updated_at)
          || right.booking_id.localeCompare(left.booking_id));
      if (!ignoreCursor && args.p_cursor_id !== null) {
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
  __setSupabaseClientForTest(null);
}

test.afterEach(restoreTestEnvironment);

test('Home route exports GET before any request contract is exercised', () => {
  assert.equal(typeof GET, 'function', routeImportError
    ? `Home route import failed: ${routeImportError.message}`
    : 'Home route must export GET');
});

test('unauthenticated GET wins before query parsing or data fetch', async () => {
  assert.equal(typeof GET, 'function', routeImportError
    ? `Home route import failed: ${routeImportError.message}`
    : 'Home route must export GET');
  const response = await GET(new Request('https://example.test/api/v2/guide/home?unknown=x'));
  const body = await response.json();
  assert.deepEqual({ status: response.status, body }, {
    status: 401,
    body: { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
  });
});

test('legacy canonical runtime wins before query parsing or source gateways', async () => {
  const fake = createSupabaseFake({ runtimeBackendMode: 'legacy' });
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/home?unknown=x'));
  const body = await response.json();
  assert.deepEqual({ status: response.status, body }, {
    status: 409,
    body: { success: false, error: { code: 'BACKEND_MODE_MISMATCH', message: 'Guide backend mode conflict' } },
  });
  assert.equal(fake.calls.some((call) => call.type === 'rpc'), false);
  assert.equal(fake.calls.some((call) => call.table === 'order_messages'), false);
});

test('valid GET uses canonical profile and allowlisted booking/message home DTO', async () => {
  const fake = createSupabaseFake();
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/home'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    data: {
      profile: { displayName: 'DB Canonical Name' },
      counters: { pendingBookingRequests: 1, messageThreadsNeedingReply: 1 },
      priorityRequests: [{
        requestRef: `booking_${BOOKING_ID}`,
        travelerDisplayName: '王小明',
        serviceTitle: '島嶼散步',
        startAt: '2026-08-01T02:00:00.000Z',
        partySize: 2,
        receivedAt: '2026-07-28T00:00:00.000Z',
        paymentDeadlineAt: '2026-07-29T00:15:00.000Z',
        needsReply: false,
      }],
      recentProgress: [{
        requestRef: `booking_${BOOKING_ID}`,
        serviceTitle: '島嶼散步',
        bucket: 'new',
        secondaryState: 'pending_approval',
        updatedAt: '2026-07-28T00:00:00.000Z',
      }],
      messages: { latestNeedsReplyAt: '2026-07-28T00:30:00.000Z' },
    },
  });
  assert.doesNotMatch(JSON.stringify(body), /private|sender-secret|contact|body|orderId|cookie|token|secret/iu);
  assert.equal(JSON.stringify(body).includes('Cookie Guide Name'), false);
  const rpc = fake.calls.find((call) => call.type === 'rpc');
  assert.deepEqual(rpc.args, {
    p_guide_id: GUIDE_ID,
    p_bucket: 'all',
    p_sort: 'priority',
    p_cursor_rank: null,
    p_cursor_at: null,
    p_cursor_id: null,
    p_limit: 51,
  });
});

test('authenticated unknown query is rejected before request or message fetch', async () => {
  const fake = createSupabaseFake();
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/home?unknown=x'));
  const body = await response.json();
  assert.deepEqual({ status: response.status, body }, {
    status: 422,
    body: { success: false, error: { code: 'INVALID_HOME_QUERY', message: 'Invalid home query' } },
  });
  assert.equal(fake.calls.some((call) => call.type === 'rpc'), false);
  assert.equal(fake.calls.some((call) => call.table === 'order_messages'), false);
});

test('true empty sources return the only legal zero-valued home DTO', async () => {
  const fake = createSupabaseFake({ listRows: [], messageRows: [] });
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/home'));
  const body = await response.json();
  assert.deepEqual(body, {
    success: true,
    data: {
      profile: { displayName: 'DB Canonical Name' },
      counters: { pendingBookingRequests: 0, messageThreadsNeedingReply: 0 },
      priorityRequests: [],
      recentProgress: [],
      messages: { latestNeedsReplyAt: null },
    },
  });
  assert.equal(Object.hasOwn(body.data, 'inquiryCount'), false);
  assert.equal(Object.hasOwn(body.data, 'inquiries'), false);
  assert.equal(Object.hasOwn(body.data, 'newRequests'), false);
});

test('requests are read through every cursor page before counters and capped lists are projected', async () => {
  const rows = Array.from({ length: 52 }, (_, index) => rpcRow({
    bookingId: indexedUuid('11111111-1111-4111-8111', index),
    orderId: indexedUuid('22222222-2222-4222-8222', index),
    updatedAt: new Date(Date.UTC(2026, 6, 28, 0, 0, 52 - index)).toISOString(),
  }));
  const fake = createSupabaseFake({ listRows: rows, messageRows: [] });
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/home'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.counters.pendingBookingRequests, 52);
  assert.equal(body.data.priorityRequests.length, 3);
  assert.equal(body.data.recentProgress.length, 3);
  assert.deepEqual(body.data.recentProgress.map((item) => item.updatedAt), [
    '2026-07-28T00:00:52.000Z',
    '2026-07-28T00:00:51.000Z',
    '2026-07-28T00:00:50.000Z',
  ]);
  assert.equal(fake.calls.filter((call) => call.type === 'rpc').length, 2);
  assert.equal(fake.calls.some((call) => call.type === 'order'), true);
});

test('cursor cycles fail closed as sanitized 500 without messages or partial success', async () => {
  const rows = Array.from({ length: 51 }, (_, index) => rpcRow({
    bookingId: indexedUuid('11111111-1111-4111-8111', index),
    orderId: indexedUuid('22222222-2222-4222-8222', index),
    updatedAt: new Date(Date.UTC(2026, 6, 28, 0, 0, 51 - index)).toISOString(),
  }));
  const fake = createSupabaseFake({ listRows: rows, ignoreCursor: true });
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/home'));
  const body = await response.json();
  assert.deepEqual({ status: response.status, body }, {
    status: 500,
    body: { success: false, error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' } },
  });
  assert.equal(fake.calls.some((call) => call.type === 'order'), false);
  assert.doesNotMatch(JSON.stringify(body), /database|private|secret|password/iu);
});

test('request backend errors fail closed without fake counters', async () => {
  const fake = createSupabaseFake({ listError: 'database password MUST_NOT_LEAK' });
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/home'));
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    success: false,
    error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' },
  });
  assert.doesNotMatch(JSON.stringify(body), /MUST_NOT_LEAK|password|database/iu);
  assert.equal(fake.calls.some((call) => call.type === 'order'), false);
});

test('invalid request projections fail closed without messages or partial success', async () => {
  const invalid = rpcRow();
  invalid.email_masked = 'traveler@example.com';
  const fake = createSupabaseFake({ listRows: [invalid] });
  installTestEnvironment(fake);
  const response = await GET(requestFor('/api/v2/guide/home'));
  const body = await response.json();
  assert.deepEqual({ status: response.status, body }, {
    status: 500,
    body: { success: false, error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' } },
  });
  assert.equal(fake.calls.some((call) => call.type === 'order'), false);
});

test('message backend or projection errors fail closed instead of returning request-only data', async () => {
  for (const fake of [
    createSupabaseFake({ messageError: 'message database MUST_NOT_LEAK' }),
    createSupabaseFake({ messageRows: [messageRow({ senderRole: 'unknown' })] }),
  ]) {
    installTestEnvironment(fake);
    const response = await GET(requestFor('/api/v2/guide/home'));
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.deepEqual(body, {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' },
    });
    assert.doesNotMatch(JSON.stringify(body), /MUST_NOT_LEAK|database|unknown/iu);
  }
});
