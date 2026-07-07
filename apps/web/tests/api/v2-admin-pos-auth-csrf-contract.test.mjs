import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MIDDLEWARE = path.join(ROOT, 'middleware.ts');
const DETAIL_ROUTE = path.join(ROOT, 'app/api/v2/admin/pos/bookings/[bookingId]/route.ts');
const MANUAL_PAYMENT_ROUTE = path.join(
  ROOT,
  'app/api/v2/admin/pos/bookings/[bookingId]/manual-payment/route.ts'
);
const REFUND_ROUTE = path.join(ROOT, 'app/api/v2/admin/pos/orders/[orderId]/refund/route.ts');
const ADDITIONAL_PAYMENT_ROUTE = path.join(
  ROOT,
  'app/api/v2/admin/pos/orders/[orderId]/additional-payment/route.ts'
);

const ADMIN_TOKEN = 'test-admin-token-contract-only';
const ADMIN_EMAIL = 'admin.contract@example.test';
const DISALLOWED_EMAIL = 'blocked.contract@example.test';
const FUTURE_EXPIRES_AT = '2099-01-01T00:00:00.000Z';
const POS_DETAIL_PATH = '/api/v2/admin/pos/bookings/550e8400-e29b-41d4-a716-446655440000';
const POS_MANUAL_PAYMENT_PATH = `${POS_DETAIL_PATH}/manual-payment`;

function makeRequest({
  path = POS_DETAIL_PATH,
  method = 'GET',
  headers = {},
  cookies = {},
} = {}) {
  const normalizedHeaders = new Headers(headers);
  return {
    method,
    headers: normalizedHeaders,
    nextUrl: new URL(`https://contract.test${path}`),
    cookies: {
      get(name) {
        return cookies[name] == null ? undefined : { name, value: cookies[name] };
      },
      getAll() {
        return Object.entries(cookies).map(([name, value]) => ({ name, value }));
      },
    },
  };
}

async function importMiddlewareWithoutLiveSupabase() {
  const previous = {
    ADMIN_ACCESS_TOKEN: process.env.ADMIN_ACCESS_TOKEN,
    ADMIN_EMAIL_ALLOWLIST: process.env.ADMIN_EMAIL_ALLOWLIST,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  process.env.ADMIN_ACCESS_TOKEN = ADMIN_TOKEN;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const imported = await import(`${MIDDLEWARE}?contract=${Date.now()}-${Math.random()}`);
  return {
    middleware: imported.middleware,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

async function runMiddleware(input) {
  const { middleware, restore } = await importMiddlewareWithoutLiveSupabase();
  try {
    return await middleware(makeRequest(input));
  } finally {
    restore();
  }
}

async function readJson(response) {
  return response.json();
}

function adminCookieSession(overrides = {}) {
  return {
    admin_token: ADMIN_TOKEN,
    admin_email: ADMIN_EMAIL,
    admin_session_version: '1',
    admin_session_expires_at: FUTURE_EXPIRES_AT,
    ...overrides,
  };
}

test('middleware matcher covers all /api/v2/admin routes, including admin POS', async () => {
  const src = await readFile(MIDDLEWARE, 'utf8');

  assert.match(src, /'\/api\/v2\/admin\/:path\*'/);
  assert.match(src, /pathname\.startsWith\('\/api\/v2\/admin'\)/);
  assert.match(src, /pathname\.startsWith\('\/api\/v2\/admin\/'\)/);
});

test('v2 admin POS API rejects missing admin token before route code can run', async () => {
  const response = await runMiddleware({
    path: POS_DETAIL_PATH,
    method: 'GET',
    headers: { 'x-admin-email': ADMIN_EMAIL },
  });

  assert.equal(response.status, 401);
  const body = await readJson(response);
  assert.equal(body.error.code, 'UNAUTHORIZED');
  assert.equal(body.error.message, 'invalid token');
});

test('v2 admin POS API rejects missing admin email when allowlist is configured', async () => {
  const response = await runMiddleware({
    path: POS_DETAIL_PATH,
    method: 'GET',
    headers: { 'x-admin-token': ADMIN_TOKEN },
  });

  assert.equal(response.status, 401);
  const body = await readJson(response);
  assert.equal(body.error.code, 'UNAUTHORIZED');
  assert.equal(body.error.message, 'email required');
});

test('v2 admin POS API rejects disallowed admin email', async () => {
  const response = await runMiddleware({
    path: POS_DETAIL_PATH,
    method: 'GET',
    headers: { 'x-admin-token': ADMIN_TOKEN, 'x-admin-email': DISALLOWED_EMAIL },
  });

  assert.equal(response.status, 401);
  const body = await readJson(response);
  assert.equal(body.error.code, 'UNAUTHORIZED');
  assert.equal(body.error.message, 'email not allowlisted');
});

test('header-only admin POS script mode can POST without CSRF only after admin auth passes', async () => {
  const response = await runMiddleware({
    path: POS_MANUAL_PAYMENT_PATH,
    method: 'POST',
    headers: { 'x-admin-token': ADMIN_TOKEN, 'x-admin-email': ADMIN_EMAIL },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('header-only admin POS script mode still rejects missing email without CSRF masking the auth error', async () => {
  const response = await runMiddleware({
    path: POS_MANUAL_PAYMENT_PATH,
    method: 'POST',
    headers: { 'x-admin-token': ADMIN_TOKEN },
  });

  assert.equal(response.status, 401);
  const body = await readJson(response);
  assert.equal(body.error.code, 'UNAUTHORIZED');
  assert.equal(body.error.message, 'email required');
});

test('cookie-session admin POS POST requires matching double-submit CSRF token', async () => {
  const response = await runMiddleware({
    path: POS_MANUAL_PAYMENT_PATH,
    method: 'POST',
    cookies: adminCookieSession({ tp_csrf: 'csrf-token-1' }),
    headers: { 'x-csrf-token': 'csrf-token-1' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('cookie-session admin POS POST rejects missing CSRF token before route code can run', async () => {
  const response = await runMiddleware({
    path: POS_MANUAL_PAYMENT_PATH,
    method: 'POST',
    cookies: adminCookieSession(),
  });

  assert.equal(response.status, 403);
  const body = await readJson(response);
  assert.equal(body.error.code, 'CSRF_REQUIRED');
});

test('cookie-session admin POS POST rejects mismatched CSRF token before route code can run', async () => {
  const response = await runMiddleware({
    path: POS_MANUAL_PAYMENT_PATH,
    method: 'POST',
    cookies: adminCookieSession({ tp_csrf: 'cookie-token' }),
    headers: { 'x-csrf-token': 'header-token' },
  });

  assert.equal(response.status, 403);
  const body = await readJson(response);
  assert.equal(body.error.code, 'CSRF_REQUIRED');
});

test('cookie-session admin POS GET requires valid session-version contract', async () => {
  const response = await runMiddleware({
    path: POS_DETAIL_PATH,
    method: 'GET',
    cookies: adminCookieSession({ admin_session_version: '0' }),
  });

  assert.equal(response.status, 401);
  const body = await readJson(response);
  assert.equal(body.error.code, 'UNAUTHORIZED');
  assert.equal(body.error.message, 'session expired');
});

test('admin POS route auth seam is documented: detail/manual-payment/refund rely on middleware, additional-payment also checks Supabase user', async () => {
  const [detail, manualPayment, refund, additionalPayment] = await Promise.all([
    readFile(DETAIL_ROUTE, 'utf8'),
    readFile(MANUAL_PAYMENT_ROUTE, 'utf8'),
    readFile(REFUND_ROUTE, 'utf8'),
    readFile(ADDITIONAL_PAYMENT_ROUTE, 'utf8'),
  ]);

  for (const src of [detail, manualPayment, refund]) {
    assert.doesNotMatch(src, /auth\.getUser\(/);
    assert.doesNotMatch(src, /isAdminAuthorized\(/);
  }

  assert.match(additionalPayment, /supabase\.auth\.getUser\(\)/);
  assert.match(additionalPayment, /errorV2\('UNAUTHORIZED', 'Unauthorized'\)/);
});
