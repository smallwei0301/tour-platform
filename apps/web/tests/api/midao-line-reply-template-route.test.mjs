import assert from 'node:assert/strict';
import test from 'node:test';

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_ID = '44444444-4444-4444-8444-444444444444';
const INQUIRY_ID = '55555555-5555-4555-8555-555555555555';
const GUIDE_SESSION_SECRET = 'task36-reply-template-api-test-guide-session-secret-0123456789';

process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;

const { createGuideSessionCookies } = await import('../../src/lib/guide-auth.ts');
const { __setSupabaseClientForTest } = await import('../../src/lib/supabase-env.mjs');

let routeModule = {};
let routeImportError = null;
try {
  routeModule = await import('../../app/api/v2/guide/requests/[requestRef]/reply-template/route.ts');
} catch (error) {
  routeImportError = error;
}
const { POST } = routeModule;

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;

const originalEnv = {
  MIDAO_BACKEND_ENABLED: process.env.MIDAO_BACKEND_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
};

function cookieHeader(cookies) {
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

function guideCookieHeader() {
  return cookieHeader(createGuideSessionCookies(GUIDE_ID, 'Cookie Guide Name', 7));
}

function responsePayload(response) {
  return response.json().then((body) => ({ status: response.status, body }));
}

function bookingRow({
  guideId = GUIDE_ID,
  guideApprovalStatus = 'approved',
  orderStatus = 'pending_payment',
  bookingStatus = 'draft',
} = {}) {
  return {
    id: BOOKING_ID,
    booking_no: 'BK-1111',
    guide_id: guideId,
    order_id: ORDER_ID,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    status: bookingStatus,
    guide_approval_status: guideApprovalStatus,
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
      id: ORDER_ID,
      booking_id: BOOKING_ID,
      status: orderStatus,
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

function inquiryRow({ guideId = GUIDE_ID } = {}) {
  return {
    id: INQUIRY_ID,
    inquiry_no: 'IQ-2222',
    traveler_user_id: '66666666-6666-4666-8666-666666666666',
    guide_id: guideId,
    activity_id: ACTIVITY_ID,
    activity_plan_id: PLAN_ID,
    status: 'new',
    preferred_date: '2026-08-01',
    backup_date: null,
    start_time_local: '10:00',
    party_size: 2,
    language: 'zh-TW',
    pickup_required: false,
    traveler_note: '想走輕鬆路線',
    questionnaire_snapshot: {},
    answers: {},
    last_replied_at: null,
    converted_booking_id: null,
    expires_at: null,
    created_at: '2026-07-28T00:00:00.000Z',
    updated_at: '2026-07-28T00:00:00.000Z',
  };
}

function createSupabaseFake({
  detailRow = bookingRow(),
  inquiryDetailRow = null,
  runtimeBackendMode = 'midao',
} = {}) {
  const calls = [];
  const client = {
    from(table) {
      const state = {
        rows: table === 'guide_inquiries'
          ? (inquiryDetailRow ? [inquiryDetailRow] : [])
          : (detailRow ? [detailRow] : []),
      };
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
          if (table === 'guide_inquiries') {
            state.rows = state.rows.filter((row) => {
              if (field === 'guide_id') return row.guide_id === value;
              if (field === 'id') return row.id === value;
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
  process.env.NEXT_PUBLIC_SITE_URL = 'https://midao.example.test';
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

async function postReplyTemplate(requestRef, fake, {
  authenticated = true,
  body = { intent: 'acknowledge' },
  rawBody = null,
} = {}) {
  installTestEnvironment(fake);
  const init = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? { cookie: guideCookieHeader() } : {}),
    },
    body: rawBody === null ? JSON.stringify(body) : rawBody,
  };
  const request = new Request('https://example.test/api/v2/guide/requests/reply-template', init);
  return POST(request, { params: Promise.resolve({ requestRef }) });
}

test.beforeEach(() => {
  installTestEnvironment(createSupabaseFake());
});

test.afterEach(restoreTestEnvironment);

test('reply-template route 必須 export POST', () => {
  assert.equal(typeof POST, 'function', routeImportError
    ? `reply-template route import failed: ${routeImportError.message}`
    : 'reply-template route must export POST');
});

test('未授權回 401 且不觸及 runtime 或 gateway', async () => {
  const fake = createSupabaseFake();
  const response = await postReplyTemplate(`booking_${BOOKING_ID}`, fake, { authenticated: false });
  const payload = await responsePayload(response);

  assert.deepEqual(payload, {
    status: 401,
    body: { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
  });
  assert.equal(fake.calls.some((call) => call.table === 'guide_profiles'), false);
  assert.equal(fake.calls.some((call) => call.table === 'bookings'), false);
});

test('合法 booking 與 acknowledge 意圖回 200 文案，且不外洩 PII 或 UUID', async () => {
  const fake = createSupabaseFake();
  const response = await postReplyTemplate(`booking_${BOOKING_ID}`, fake);
  const payload = await responsePayload(response);

  assert.equal(payload.status, 200);
  assert.equal(payload.body.success, true);
  assert.equal(payload.body.data.intent, 'acknowledge');
  assert.match(payload.body.data.text, /BK-1111/u);
  assert.match(payload.body.data.text, /島嶼散步/u);
  assert.ok(payload.body.data.shareUrl.startsWith('https://line.me/R/share?text='));

  const serialized = JSON.stringify(payload.body);
  assert.equal(serialized.match(UUID_REGEX), null);
  assert.doesNotMatch(serialized, /traveler@example\.com|0912345678|MUST_NOT_LEAK/u);
  assert.doesNotMatch(decodeURIComponent(payload.body.data.shareUrl), /traveler@example\.com|0912345678/u);
});

test('非本人與不存在的 booking 收斂為相同 404，不洩漏存在差異', async () => {
  const missing = createSupabaseFake({ detailRow: null });
  const wrongOwner = createSupabaseFake({ detailRow: bookingRow({ guideId: OTHER_GUIDE_ID }) });

  const missingPayload = await responsePayload(await postReplyTemplate(`booking_${BOOKING_ID}`, missing));
  const wrongOwnerPayload = await responsePayload(await postReplyTemplate(`booking_${BOOKING_ID}`, wrongOwner));

  assert.deepEqual(missingPayload, {
    status: 404,
    body: { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } },
  });
  assert.deepEqual(wrongOwnerPayload, missingPayload);
});

test('非本人與不存在的 inquiry 亦收斂為相同 404', async () => {
  const missing = createSupabaseFake({ inquiryDetailRow: null });
  const wrongOwner = createSupabaseFake({ inquiryDetailRow: inquiryRow({ guideId: OTHER_GUIDE_ID }) });

  const missingPayload = await responsePayload(await postReplyTemplate(`inquiry_${INQUIRY_ID}`, missing));
  const wrongOwnerPayload = await responsePayload(await postReplyTemplate(`inquiry_${INQUIRY_ID}`, wrongOwner));

  assert.deepEqual(missingPayload, {
    status: 404,
    body: { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } },
  });
  assert.deepEqual(wrongOwnerPayload, missingPayload);
});

test('本人 inquiry 回 200 且文案用 inquiryNo 不含 UUID', async () => {
  const fake = createSupabaseFake({ inquiryDetailRow: inquiryRow() });
  const payload = await responsePayload(await postReplyTemplate(`inquiry_${INQUIRY_ID}`, fake));

  assert.equal(payload.status, 200);
  assert.match(payload.body.data.text, /IQ-2222/u);
  assert.equal(JSON.stringify(payload.body).match(UUID_REGEX), null);
  assert.equal(fake.calls.some((call) => call.table === 'bookings'), false);
});

test('無效 intent 回 422 INVALID_REPLY_INTENT 且不觸及 gateway', async () => {
  for (const intent of ['unknown', '', null, 42, undefined]) {
    const fake = createSupabaseFake();
    const payload = await responsePayload(
      await postReplyTemplate(`booking_${BOOKING_ID}`, fake, { body: { intent } }),
    );
    assert.equal(payload.status, 422, String(intent));
    assert.deepEqual(payload.body.error, {
      code: 'INVALID_REPLY_INTENT',
      message: 'Invalid reply intent',
    }, String(intent));
    assert.equal(fake.calls.some((call) => call.table === 'bookings'), false, String(intent));
  }
});

test('非合法 JSON body 回 422 INVALID_REQUEST_BODY', async () => {
  const fake = createSupabaseFake();
  const payload = await responsePayload(
    await postReplyTemplate(`booking_${BOOKING_ID}`, fake, { rawBody: '{not-json' }),
  );

  assert.equal(payload.status, 422);
  assert.deepEqual(payload.body.error, {
    code: 'INVALID_REQUEST_BODY',
    message: 'Invalid JSON request body',
  });
  assert.equal(fake.calls.some((call) => call.table === 'bookings'), false);
});

test('無效 requestRef 回 422 INVALID_REQUEST_REF', async () => {
  const fake = createSupabaseFake();
  const payload = await responsePayload(await postReplyTemplate(BOOKING_ID, fake));

  assert.equal(payload.status, 422);
  assert.deepEqual(payload.body.error, {
    code: 'INVALID_REQUEST_REF',
    message: 'Invalid request reference',
  });
  assert.equal(fake.calls.some((call) => call.table === 'bookings'), false);
});

test('可付款 booking 的 payment_link 回 200 並帶 confirmation URL', async () => {
  const fake = createSupabaseFake();
  const payload = await responsePayload(
    await postReplyTemplate(`booking_${BOOKING_ID}`, fake, { body: { intent: 'payment_link' } }),
  );

  assert.equal(payload.status, 200);
  assert.equal(payload.body.data.intent, 'payment_link');
  assert.ok(payload.body.data.text.includes('https://midao.example.test/me/orders'));
  assert.equal(JSON.stringify(payload.body).match(UUID_REGEX), null);
});

test('未核准 booking 的 payment_link 回 409 且回應無任何付款連結', async () => {
  const fake = createSupabaseFake({ detailRow: bookingRow({ guideApprovalStatus: 'pending' }) });
  const payload = await responsePayload(
    await postReplyTemplate(`booking_${BOOKING_ID}`, fake, { body: { intent: 'payment_link' } }),
  );

  assert.equal(payload.status, 409);
  assert.equal(payload.body.error.code, 'PAYMENT_LINK_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(payload.body), /midao\.example\.test|line\.me/u);
});

test('inquiry 的 payment_link 一律回 409', async () => {
  const fake = createSupabaseFake({ inquiryDetailRow: inquiryRow() });
  const payload = await responsePayload(
    await postReplyTemplate(`inquiry_${INQUIRY_ID}`, fake, { body: { intent: 'payment_link' } }),
  );

  assert.equal(payload.status, 409);
  assert.equal(payload.body.error.code, 'PAYMENT_LINK_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(payload.body), /line\.me/u);
});

test('legacy canonical runtime mode 回 409 且不觸及 gateway', async () => {
  const fake = createSupabaseFake({ runtimeBackendMode: 'legacy' });
  const payload = await responsePayload(await postReplyTemplate(`booking_${BOOKING_ID}`, fake));

  assert.deepEqual(payload, {
    status: 409,
    body: { success: false, error: { code: 'BACKEND_MODE_MISMATCH', message: 'Guide backend mode conflict' } },
  });
  assert.equal(fake.calls.some((call) => call.table === 'bookings'), false);
});

test('路由為唯讀：不呼叫 rpc、不寫入任何資料表', async () => {
  const fake = createSupabaseFake();
  await postReplyTemplate(`booking_${BOOKING_ID}`, fake, { body: { intent: 'approve' } });

  assert.equal(fake.calls.some((call) => call.type === 'rpc'), false);
  assert.equal(fake.calls.some((call) => call.type === 'update' || call.type === 'insert'), false);
});
