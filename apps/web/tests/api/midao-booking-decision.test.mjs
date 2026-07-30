import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createGuideSessionCookies } from '../../src/lib/guide-auth.ts';
import {
  __resetMidaoBookingCommandStoreForTest,
  __seedMidaoBookingCommandForTest,
  __seedMidaoBookingCommandIdempotencyForTest,
  __setMidaoBookingCommandClockForTest,
  decideMidaoBookingRequestDb,
} from '../../src/lib/midao/db-booking-commands.mjs';
import { hashIdempotentRequest } from '../../src/lib/midao/idempotency.ts';
import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';

const ROUTE_URL = new URL(
  '../../app/api/v2/guide/bookings/[bookingId]/commands/decide/route.ts',
  import.meta.url,
);
const ROUTE_PATH = fileURLToPath(ROUTE_URL);
const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const FIXED_NOW = '2026-07-29T00:00:00.000Z';

function baseCommand(overrides = {}) {
  return {
    guideId: GUIDE_ID,
    actorType: 'guide',
    actorId: GUIDE_ID,
    bookingId: BOOKING_ID,
    action: 'approve',
    note: null,
    idempotencyKey: 'decision-key-1',
    requestHash: hashIdempotentRequest({ action: 'approve' }),
    ...overrides,
  };
}

function seedBooking(overrides = {}) {
  return __seedMidaoBookingCommandForTest({
    bookingId: BOOKING_ID,
    bookingNo: 'BK-1111',
    guideId: GUIDE_ID,
    orderId: ORDER_ID,
    status: 'draft',
    guideApprovalStatus: 'pending',
    orderStatus: 'pending_payment',
    paymentDeadlineAt: null,
    ...overrides,
  });
}

function sessionCookieHeader() {
  return createGuideSessionCookies(GUIDE_ID, 'Canonical Guide', 7)
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ');
}

function requestForRoute(body, { idempotencyKey = 'decision-key-1', csrf = 'csrf-value' } = {}) {
  return new Request(`https://example.test/api/v2/guide/bookings/${BOOKING_ID}/commands/decide`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${sessionCookieHeader()}; tp_csrf=${csrf}`,
      'x-csrf-token': csrf,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function createSupabaseFake({ rpcData = null, rpcError = null } = {}) {
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, 'guide_profiles');
      const query = {
        select() { return query; },
        eq(field, value) {
          assert.equal(field, 'id');
          assert.equal(value, GUIDE_ID);
          return query;
        },
        async single() {
          return {
            data: {
              id: GUIDE_ID,
              display_name: 'Canonical Guide',
              backend_mode: 'midao',
              guide_session_version: 7,
              verification_status: 'approved',
            },
            error: null,
          };
        },
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args: structuredClone(args) });
      return { data: structuredClone(rpcData), error: rpcError };
    },
  };
  return { client, calls };
}

async function responseJson(response) {
  return { status: response.status, body: await response.json() };
}

async function postDecision(request, bookingId = BOOKING_ID) {
  const route = await import(ROUTE_URL);
  return route.POST(request, { params: Promise.resolve({ bookingId }) });
}

test.beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.GUIDE_SESSION_SECRET = 'task20-test-guide-session-secret-0123456789';
  process.env.MIDAO_BACKEND_ENABLED = '1';
  process.env.MIDAO_BACKEND_MUTATIONS_ENABLED = '1';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  __resetMidaoBookingCommandStoreForTest();
  __setMidaoBookingCommandClockForTest(() => FIXED_NOW);
});

test.afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.MIDAO_BACKEND_ENABLED;
  delete process.env.MIDAO_BACKEND_MUTATIONS_ENABLED;
  __setSupabaseClientForTest(null);
  __resetMidaoBookingCommandStoreForTest();
});

function routeSource() {
  assert.equal(existsSync(ROUTE_PATH), true, `missing decision route: ${ROUTE_PATH}`);
  return readFileSync(ROUTE_PATH, 'utf8');
}

test('atomic booking decision route is created as a V2 POST handler', async () => {
  const source = routeSource();
  const route = await import(ROUTE_URL);
  assert.equal(typeof route.POST, 'function');
  assert.match(source, /withMidaoGuideCommand/u);
});

test('atomic booking decision route stays on the command boundary and never calls legacy approval or best-effort notify helpers', () => {
  const source = routeSource();
  assert.match(source, /withMidaoGuideCommand/u);
  assert.doesNotMatch(source, /decideBookingApprovalDb|notifyBookingApprovalDecided/u);
});

test('in-memory approve returns the fixed sanitized projection and updates the pending request', async () => {
  seedBooking();
  const result = await decideMidaoBookingRequestDb(baseCommand());
  assert.deepEqual(result, {
    bookingId: BOOKING_ID,
    bookingNo: 'BK-1111',
    orderId: ORDER_ID,
    status: 'draft',
    guideApprovalStatus: 'approved',
    paymentDeadlineAt: '2026-07-30T00:00:00.000Z',
    action: 'approve',
  });
});

test('in-memory reject requires the canonical note and returns cancelled projection', async () => {
  seedBooking();
  const result = await decideMidaoBookingRequestDb(baseCommand({
    action: 'reject',
    note: '  行程已滿  ',
    requestHash: hashIdempotentRequest({ action: 'reject', note: '行程已滿' }),
    idempotencyKey: 'decision-key-reject',
  }));
  assert.deepEqual(result, {
    bookingId: BOOKING_ID,
    bookingNo: 'BK-1111',
    orderId: ORDER_ID,
    status: 'cancelled',
    guideApprovalStatus: 'rejected',
    paymentDeadlineAt: null,
    action: 'reject',
  });
});

test('missing and wrong-owner bookings collapse to the same sanitized 404', async () => {
  seedBooking();
  await assert.rejects(
    () => decideMidaoBookingRequestDb(baseCommand({ guideId: OTHER_GUIDE_ID, actorId: OTHER_GUIDE_ID })),
    (error) => error.code === 'NOT_FOUND' && error.status === 404 && error.message === 'Resource not found',
  );
  await assert.rejects(
    () => decideMidaoBookingRequestDb(baseCommand({ bookingId: '33333333-3333-4333-8333-333333333333' })),
    (error) => error.code === 'NOT_FOUND' && error.status === 404 && error.message === 'Resource not found',
  );
});

test('double decision is rejected as a stale pending decision', async () => {
  seedBooking();
  await decideMidaoBookingRequestDb(baseCommand());
  await assert.rejects(
    () => decideMidaoBookingRequestDb(baseCommand({ idempotencyKey: 'decision-key-2' })),
    (error) => error.code === 'NOT_PENDING_APPROVAL' && error.status === 409,
  );
});

test('same idempotency key and hash replays the identical completed snapshot', async () => {
  seedBooking();
  const first = await decideMidaoBookingRequestDb(baseCommand());
  const replay = await decideMidaoBookingRequestDb(baseCommand());
  assert.deepEqual(replay, first);
});

test('same idempotency key with a different request hash is a conflict', async () => {
  seedBooking();
  await decideMidaoBookingRequestDb(baseCommand());
  await assert.rejects(
    () => decideMidaoBookingRequestDb(baseCommand({
      action: 'reject',
      note: 'different',
      requestHash: hashIdempotentRequest({ action: 'reject', note: 'different' }),
    })),
    (error) => error.code === 'IDEMPOTENCY_CONFLICT' && error.status === 409,
  );
});

test('Supabase gateway calls the exact canonical RPC args and validates its projection', async () => {
  const projection = {
    bookingId: BOOKING_ID,
    bookingNo: 'BK-1111',
    orderId: ORDER_ID,
    status: 'draft',
    guideApprovalStatus: 'approved',
    paymentDeadlineAt: '2026-07-30T00:00:00.000Z',
    action: 'approve',
  };
  const { client, calls } = createSupabaseFake({ rpcData: projection });
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(client);

  const result = await decideMidaoBookingRequestDb(baseCommand());
  assert.deepEqual(result, projection);
  assert.deepEqual(calls, [{
    name: 'midao_decide_booking_request',
    args: {
      p_guide_id: GUIDE_ID,
      p_actor_type: 'guide',
      p_actor_id: GUIDE_ID,
      p_booking_id: BOOKING_ID,
      p_action: 'approve',
      p_note: null,
      p_idempotency_key: 'decision-key-1',
      p_request_hash: hashIdempotentRequest({ action: 'approve' }),
    },
  }]);
});

test('processing idempotency placeholders return an in-progress conflict and never leak the placeholder', async () => {
  seedBooking();
  __seedMidaoBookingCommandIdempotencyForTest(baseCommand());
  await assert.rejects(
    () => decideMidaoBookingRequestDb(baseCommand()),
    (error) => error.code === 'IDEMPOTENCY_IN_PROGRESS' && error.status === 409,
  );
});

test('Supabase known RPC errors map to the fixed public matrix while unknown or PII-bearing failures are sanitized', async () => {
  const known = [
    ['NOT_FOUND', 404],
    ['IDEMPOTENCY_CONFLICT', 409],
    ['IDEMPOTENCY_IN_PROGRESS', 409],
    ['NOT_PENDING_APPROVAL', 409],
    ['INVALID_BOOKING_ID', 422],
    ['INVALID_ACTION', 422],
    ['INVALID_NOTE', 422],
    ['INVALID_IDEMPOTENCY_KEY', 422],
  ];
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  for (const [code, status] of known) {
    const { client } = createSupabaseFake({ rpcError: { code: 'P0001', message: `${code}: secret email password` } });
    __setSupabaseClientForTest(client);
    await assert.rejects(
      () => decideMidaoBookingRequestDb(baseCommand()),
      (error) => error.code === code && error.status === status && !error.message.includes('secret'),
    );
  }

  const { client: unknownClient } = createSupabaseFake({
    rpcError: { code: 'XX000', message: 'database password email phone token leaked' },
  });
  __setSupabaseClientForTest(unknownClient);
  await assert.rejects(
    () => decideMidaoBookingRequestDb(baseCommand()),
    (error) => !error.code && !error.message.includes('password') && !error.message.includes('email'),
  );
});

test('Supabase relation corruption is sanitized as INTERNAL_ERROR while a missing booking remains NOT_FOUND', async () => {
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  const { client: corruptClient } = createSupabaseFake({
    rpcError: { code: 'P0002', message: 'MIDAO_BOOKING_RELATION_INVALID: private booking data' },
  });
  __setSupabaseClientForTest(corruptClient);
  const corruptResponse = await postDecision(requestForRoute({ action: 'approve' }));
  const corruptPayload = await responseJson(corruptResponse);
  assert.equal(corruptPayload.status, 500);
  assert.deepEqual(corruptPayload.body.error, {
    code: 'INTERNAL_ERROR',
    message: '伺服器發生錯誤，請稍後再試',
  });

  const { client: missingClient } = createSupabaseFake({
    rpcError: { code: 'P0002', message: 'BOOKING_NOT_FOUND: private booking data' },
  });
  __setSupabaseClientForTest(missingClient);
  const missingResponse = await postDecision(requestForRoute({ action: 'approve' }));
  const missingPayload = await responseJson(missingResponse);
  assert.equal(missingPayload.status, 404);
  assert.deepEqual(missingPayload.body.error, {
    code: 'NOT_FOUND',
    message: 'Resource not found',
  });
});

test('Supabase projection validation rejects extra PII keys, wrong UUIDs, and invalid timestamps', async () => {
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  const baseProjection = {
    bookingId: BOOKING_ID,
    bookingNo: 'BK-1111',
    orderId: ORDER_ID,
    status: 'draft',
    guideApprovalStatus: 'approved',
    paymentDeadlineAt: '2026-07-30T00:00:00.000Z',
    action: 'approve',
  };
  for (const rpcData of [
    { ...baseProjection, email: 'person@example.com' },
    { ...baseProjection, orderId: 'not-a-uuid' },
    { ...baseProjection, paymentDeadlineAt: 'not-a-timestamp' },
  ]) {
    const { client } = createSupabaseFake({ rpcData });
    __setSupabaseClientForTest(client);
    await assert.rejects(
      () => decideMidaoBookingRequestDb(baseCommand()),
      (error) => !error.code && error.status === undefined && !error.message.includes('person@example.com'),
    );
  }
});

test('route normalizes the exact body before hashing and passes the canonical command to Supabase', async () => {
  const projection = {
    bookingId: BOOKING_ID,
    bookingNo: 'BK-1111',
    orderId: ORDER_ID,
    status: 'cancelled',
    guideApprovalStatus: 'rejected',
    paymentDeadlineAt: null,
    action: 'reject',
  };
  const { client, calls } = createSupabaseFake({ rpcData: projection });
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(client);

  const response = await postDecision(requestForRoute({ note: '  行程已滿  ', action: 'reject' }));
  assert.deepEqual(await responseJson(response), { status: 200, body: { success: true, data: projection } });
  assert.deepEqual(calls[0].args, {
    p_guide_id: GUIDE_ID,
    p_actor_type: 'guide',
    p_actor_id: GUIDE_ID,
    p_booking_id: BOOKING_ID,
    p_action: 'reject',
    p_note: '行程已滿',
    p_idempotency_key: 'decision-key-1',
    p_request_hash: hashIdempotentRequest({ action: 'reject', note: '行程已滿' }),
  });
});

test('route rejects strict UUID/body/action/note violations before the gateway', async () => {
  const { client, calls } = createSupabaseFake({
    rpcData: {
      bookingId: BOOKING_ID,
      bookingNo: 'BK-1111',
      orderId: ORDER_ID,
      status: 'draft',
      guideApprovalStatus: 'approved',
      paymentDeadlineAt: '2026-07-30T00:00:00.000Z',
      action: 'approve',
    },
  });
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(client);

  const cases = [
    ['invalid booking id', requestForRoute({ action: 'approve' }), 'not-a-uuid', 'INVALID_BOOKING_ID'],
    ['unknown body key', requestForRoute({ action: 'approve', extra: true }), BOOKING_ID, 'INVALID_REQUEST_BODY'],
    ['invalid action', requestForRoute({ action: 'APPROVE' }), BOOKING_ID, 'INVALID_ACTION'],
    ['reject note required', requestForRoute({ action: 'reject' }), BOOKING_ID, 'INVALID_NOTE'],
    ['note byte limit', requestForRoute({ action: 'approve', note: '你'.repeat(501) }), BOOKING_ID, 'INVALID_NOTE'],
  ];
  for (const [name, request, bookingId, code] of cases) {
    const response = await postDecision(request, bookingId);
    const payload = await responseJson(response);
    assert.equal(payload.status, 422, name);
    assert.equal(payload.body.error.code, code, name);
  }
  assert.equal(calls.length, 0);
});

test('route returns INVALID_REQUEST_BODY for malformed JSON and guard failures never invoke the command gateway', async () => {
  const { client, calls } = createSupabaseFake();
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(client);

  const malformed = new Request(`https://example.test/api/v2/guide/bookings/${BOOKING_ID}/commands/decide`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${sessionCookieHeader()}; tp_csrf=csrf-value`,
      'x-csrf-token': 'csrf-value',
      'idempotency-key': 'decision-key-1',
    },
    body: '{',
  });
  const malformedResponse = await postDecision(malformed);
  const malformedPayload = await responseJson(malformedResponse);
  assert.equal(malformedPayload.status, 422);
  assert.equal(malformedPayload.body.error.code, 'INVALID_REQUEST_BODY');

  const noCsrf = await postDecision(requestForRoute({ action: 'approve' }, { csrf: '' }));
  assert.equal(noCsrf.status, 403);
  assert.equal((await noCsrf.json()).error.code, 'CSRF_REQUIRED');

  process.env.MIDAO_BACKEND_MUTATIONS_ENABLED = '0';
  const disabled = await postDecision(requestForRoute({ action: 'approve' }));
  assert.equal(disabled.status, 503);
  assert.equal((await disabled.json()).error.code, 'MUTATIONS_DISABLED');
  assert.equal(calls.length, 0);
});
