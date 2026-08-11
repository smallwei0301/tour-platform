import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpCookieJar } from './support/http-cookie-jar.mjs';

const IDS = Object.freeze({
  activity: '66666666-6666-4666-8666-666666666666',
  plan: '88888888-8888-4888-8888-888888888888',
});
const GUIDE = Object.freeze({
  email: 'midao-e2e@example.invalid',
  password: 'midao-e2e-only-password',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN = /^[0-9a-f]{64}$/u;

function requireLoopbackUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`MIDAO_API_CHAIN_ENV_REQUIRED:${name}`);
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`MIDAO_API_CHAIN_ENV_INVALID:${name}`); }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`MIDAO_API_CHAIN_ENV_INVALID:${name}`);
  }
  return parsed;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`MIDAO_API_CHAIN_ENV_REQUIRED:${name}`);
  return value;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { throw new Error(`MIDAO_API_CHAIN_NON_JSON_RESPONSE:${response.status}`); }
  }
  return { response, status: response.status, body };
}

function apiUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

async function loginTraveler({ apiBaseUrl, supabaseUrl, anonKey }) {
  const login = await jsonRequest(new URL('/auth/v1/token?grant_type=password', supabaseUrl), {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: requireEnv('MIDAO_E2E_TRAVELER_EMAIL'),
      password: requireEnv('MIDAO_E2E_TRAVELER_PASSWORD'),
    }),
  });
  assert.equal(login.status, 200, 'traveler password login must use the local GoTrue endpoint');
  assert.equal(login.body?.user?.id, '55555555-5555-4555-8555-555555555555');

  const jar = createHttpCookieJar();
  const projectRef = supabaseUrl.hostname.split('.', 1)[0];
  jar.set(`sb-${projectRef}-auth-token`, encodeURIComponent(JSON.stringify(login.body)));
  jar.set('tp_csrf', 'midao-api-chain-csrf');
  return { jar, csrf: 'midao-api-chain-csrf' };
}

async function loginGuide(apiBaseUrl) {
  const jar = createHttpCookieJar();
  const csrf = await jsonRequest(apiUrl(apiBaseUrl, '/api/guide/auth/csrf'));
  assert.equal(csrf.status, 200);
  assert.equal(csrf.body?.ok, true);
  assert.equal(typeof csrf.body?.data?.csrfToken, 'string');
  jar.add(csrf.response);
  const csrfToken = csrf.body.data.csrfToken;

  const login = await jsonRequest(apiUrl(apiBaseUrl, '/api/guide/auth/session'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: jar.header(),
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify(GUIDE),
  });
  assert.equal(login.status, 200, 'guide login must use its real API session endpoint');
  assert.equal(login.body?.ok, true);
  assert.equal(login.body?.data?.created, true);
  jar.add(login.response);
  assert.match(jar.header(), /(?:^|; )guide_token=/u);
  assert.match(jar.header(), /(?:^|; )guide_id=/u);
  // Login rotates tp_csrf (the session route re-issues createCsrfCookie).
  // The double-submit check compares the cookie with the x-csrf-token header,
  // so later requests must send the freshest jar value, not the pre-login one.
  const rotated = jar.get('tp_csrf');
  return { jar, csrf: rotated ? decodeURIComponent(rotated) : csrfToken };
}

function commandHeaders(session, idempotencyKey) {
  return {
    'content-type': 'application/json',
    cookie: session.jar.header(),
    'x-csrf-token': session.csrf,
    'idempotency-key': idempotencyKey,
  };
}

test('API-only real HTTP chain gates checkout until traveler confirmation is accepted', { timeout: 240_000 }, async () => {
  const apiBaseUrl = requireLoopbackUrl('MIDAO_API_BASE_URL');
  const supabaseUrl = requireLoopbackUrl('SUPABASE_URL');
  const traveler = await loginTraveler({
    apiBaseUrl,
    supabaseUrl,
    anonKey: requireEnv('SUPABASE_ANON_KEY'),
  });

  const inquiry = await jsonRequest(apiUrl(apiBaseUrl, '/api/v2/public/guides/midao-e2e-guide/inquiries'), {
    method: 'POST',
    headers: commandHeaders(traveler, 'midao-api-chain-inquiry'),
    body: JSON.stringify({
      activity_id: IDS.activity,
      preferred_date: '2030-09-01',
      plan_selector: { slug: 'midao-e2e-request' },
      questionnaire_version: 1,
      answers: [{ question_id: 'experience_level', value: 'beginner' }],
      party_size: 2,
      language: 'zh-TW',
    }),
  });
  assert.equal(inquiry.status, 201);
  const inquiryId = inquiry.body?.data?.inquiry_id;
  assert.equal(typeof inquiryId, 'string');
  assert.match(inquiryId, UUID);

  const guide = await loginGuide(apiBaseUrl);
  const homeProbe = await jsonRequest(apiUrl(apiBaseUrl, '/api/v2/guide/home'), {
    method: 'GET',
    headers: { cookie: guide.jar.header(), 'x-csrf-token': guide.csrf },
  });
  const replied = await jsonRequest(apiUrl(apiBaseUrl, `/api/v2/guide/inquiries/${inquiryId}/commands/mark-replied`), {
    method: 'POST',
    headers: commandHeaders(guide, `midao-api-chain-reply-${inquiryId}`),
    body: '{}',
  });
  assert.equal(replied.status, 200);
  assert.equal(replied.body?.success, true);

  const converted = await jsonRequest(apiUrl(apiBaseUrl, `/api/v2/guide/inquiries/${inquiryId}/commands/convert`), {
    method: 'POST',
    headers: commandHeaders(guide, `midao-api-chain-convert-${inquiryId}`),
    body: JSON.stringify({
      activityPlanId: IDS.plan,
      startAt: '2030-09-01T01:00:00.000Z',
      endAt: '2030-09-01T05:00:00.000Z',
      participants: 2,
      quotedTotalTwd: 3600,
      confirmationTtlHours: 24,
    }),
  });
  assert.equal(converted.status, 200);
  assert.equal(converted.body?.success, true);
  assert.equal(converted.body?.data?.created, true);
  const bookingId = converted.body?.data?.bookingId;
  const confirmationToken = converted.body?.data?.confirmationToken;
  assert.equal(typeof bookingId, 'string');
  assert.match(bookingId, UUID);
  assert.equal(typeof confirmationToken, 'string');
  assert.match(confirmationToken, TOKEN);

  const beforeAcceptance = await jsonRequest(apiUrl(apiBaseUrl, `/api/v2/bookings/${bookingId}/checkout`), {
    method: 'POST',
    headers: commandHeaders(traveler, `midao-api-chain-checkout-before-${bookingId}`),
    body: JSON.stringify({ provider: 'transfer' }),
  });
  assert.equal(beforeAcceptance.status, 409);
  assert.equal(beforeAcceptance.body?.error?.code, 'TRAVELER_CONFIRMATION_REQUIRED');

  const accepted = await jsonRequest(apiUrl(apiBaseUrl, `/api/v2/me/booking-confirmations/${confirmationToken}/accept`), {
    method: 'POST',
    headers: commandHeaders(traveler, `midao-api-chain-accept-${bookingId}`),
    body: '{}',
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body?.success, true);
  assert.equal(accepted.body?.data?.bookingStatus, 'confirmed');

  const afterAcceptance = await jsonRequest(apiUrl(apiBaseUrl, `/api/v2/bookings/${bookingId}/checkout`), {
    method: 'POST',
    headers: commandHeaders(traveler, `midao-api-chain-checkout-after-${bookingId}`),
    body: JSON.stringify({ provider: 'transfer' }),
  });
  assert.equal(afterAcceptance.status, 200);
  assert.equal(afterAcceptance.body?.success, true);
  assert.equal(afterAcceptance.body?.data?.provider, 'transfer');
  assert.equal(afterAcceptance.body?.data?.awaitingManualPayment, true);
});
