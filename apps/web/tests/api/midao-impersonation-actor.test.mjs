import assert from 'node:assert/strict';
import test from 'node:test';
import {
  signDomainSeparatedValue,
  signGuideSession,
  verifyDomainSeparatedValue,
} from '../../src/lib/guide/session-crypto.ts';

const moduleUrl = new URL('../../src/lib/midao/impersonation-actor.ts', import.meta.url);
const actorModule = await import(moduleUrl.href);
const {
  MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME,
  createImpersonationActorCookie,
  verifyImpersonationActorCookie,
  clearImpersonationActorCookie,
} = actorModule;

const issuedAt = Date.UTC(2026, 6, 23, 9, 0, 0);
const guideSessionExpiresAt = issuedAt + (2 * 60 * 60 * 1000);

function createCookie(overrides = {}) {
  return createImpersonationActorCookie({
    adminEmail: '  Admin@Example.COM ',
    targetGuideId: 'guide-target-123',
    issuedAt,
    guideSessionExpiresAt,
    ...overrides,
  });
}

function cookiePair(setCookie) {
  return setCookie.split(';')[0];
}

function decodeValue(setCookie) {
  const value = cookiePair(setCookie).slice(`${MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME}=`.length);
  const [encodedPayload, signature] = value.split('.');
  return {
    encodedPayload,
    signature,
    payload: JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')),
  };
}

test('signed actor cookie round-trips normalized canonical actor and target', () => {
  assert.equal(MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME, 'midao_impersonation_actor');
  const cookie = createCookie();
  const actor = verifyImpersonationActorCookie(cookiePair(cookie), {
    targetGuideId: 'guide-target-123',
    now: issuedAt + 1_000,
  });
  assert.deepEqual(actor, {
    actorType: 'admin',
    actorId: 'admin@example.com',
    targetGuideId: 'guide-target-123',
    issuedAt,
    expiresAt: issuedAt + (60 * 60 * 1000),
  });
  const { payload } = decodeValue(cookie);
  assert.equal(payload.adminToken, undefined);
  assert.equal(JSON.stringify(payload).includes('token'), false);
});

test('cookie scope, security attributes, and expiry match the signed payload', () => {
  const hadPreviousNodeEnv = Object.hasOwn(process.env, 'NODE_ENV');
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const cookie = createCookie();
    const { payload } = decodeValue(cookie);
    assert.match(cookie, /^midao_impersonation_actor=[^;]+;/);
    assert.match(cookie, /; Path=\//);
    assert.match(cookie, /; HttpOnly/);
    assert.match(cookie, /; SameSite=Lax/);
    assert.match(cookie, /; Secure/);
    assert.doesNotMatch(cookie, /; Domain=/i);
    assert.match(cookie, /; Max-Age=3600(?:;|$)/);
    const expires = cookie.match(/; Expires=([^;]+)/)?.[1];
    assert.equal(Date.parse(expires), payload.expiresAt);
    assert.ok(payload.expiresAt <= guideSessionExpiresAt);

    process.env.NODE_ENV = 'test';
    const nonProduction = createCookie();
    assert.doesNotMatch(nonProduction, /; Secure/);
  } finally {
    if (hadPreviousNodeEnv) {
      process.env.NODE_ENV = previousNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  }
});

test('target mismatch, payload tamper, signature tamper, and expiry are rejected', () => {
  const cookie = createCookie();
  assert.equal(verifyImpersonationActorCookie(cookiePair(cookie), {
    targetGuideId: 'different-guide',
    now: issuedAt + 1_000,
  }), null);
  assert.equal(verifyImpersonationActorCookie(cookiePair(cookie), {
    targetGuideId: 'guide-target-123',
    now: issuedAt + (60 * 60 * 1000),
  }), null);

  const { encodedPayload, signature, payload } = decodeValue(cookie);
  const changedPayload = Buffer.from(JSON.stringify({ ...payload, actorId: 'other@example.com' })).toString('base64url');
  const tamperedPayload = `${MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME}=${changedPayload}.${signature}`;
  assert.equal(verifyImpersonationActorCookie(tamperedPayload, {
    targetGuideId: 'guide-target-123',
    now: issuedAt + 1_000,
  }), null);

  const tamperedSignature = `${MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME}=${encodedPayload}.${'0'.repeat(64)}`;
  assert.equal(verifyImpersonationActorCookie(tamperedSignature, {
    targetGuideId: 'guide-target-123',
    now: issuedAt + 1_000,
  }), null);
});

test('actor and guide signatures cannot validate across protocols', () => {
  const cookie = createCookie();
  const { encodedPayload, signature } = decodeValue(cookie);
  assert.equal(verifyDomainSeparatedValue('midao:impersonation-actor:v1', encodedPayload, signGuideSession('guide-target-123', 1)), false);

  const guideSignatureCookie = `${MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME}=${encodedPayload}.${signGuideSession('guide-target-123', 1)}`;
  assert.equal(verifyImpersonationActorCookie(guideSignatureCookie, {
    targetGuideId: 'guide-target-123',
    now: issuedAt + 1_000,
  }), null);
  assert.equal(signature.length, 64);
});

test('subsecond input is normalized to one cookie-representable signed deadline', () => {
  const subsecondIssuedAt = issuedAt + 250;
  const subsecondGuideExpiry = subsecondIssuedAt + 1_500;
  const cookie = createCookie({
    issuedAt: subsecondIssuedAt,
    guideSessionExpiresAt: subsecondGuideExpiry,
  });
  const { payload } = decodeValue(cookie);
  const maxAge = Number(cookie.match(/; Max-Age=(\d+)/)?.[1]);
  const expires = Date.parse(cookie.match(/; Expires=([^;]+)/)?.[1]);
  assert.equal(payload.issuedAt % 1_000, 0);
  assert.equal(payload.expiresAt % 1_000, 0);
  assert.equal(expires, payload.expiresAt);
  assert.equal(maxAge * 1_000, payload.expiresAt - payload.issuedAt);
  assert.ok(payload.expiresAt <= subsecondGuideExpiry);
});

test('valid signatures with extra payload keys are rejected', () => {
  const original = decodeValue(createCookie()).payload;
  for (const extra of [{ adminToken: 'must-not-survive' }, { unknown: true }]) {
    const encoded = Buffer.from(JSON.stringify({ ...original, ...extra }), 'utf8').toString('base64url');
    const signature = signDomainSeparatedValue('midao:impersonation-actor:v1', encoded);
    const cookie = `${MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME}=${encoded}.${signature}`;
    assert.equal(verifyImpersonationActorCookie(cookie, {
      targetGuideId: 'guide-target-123',
      now: issuedAt + 1_000,
    }), null);
  }
});

test('clear cookie uses the exact host-only scope and immediate expiry', () => {
  const clear = clearImpersonationActorCookie();
  assert.match(clear, /^midao_impersonation_actor=/);
  assert.match(clear, /; Path=\//);
  assert.match(clear, /; HttpOnly/);
  assert.match(clear, /; SameSite=Lax/);
  assert.match(clear, /; Max-Age=0(?:;|$)/);
  assert.match(clear, /; Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  assert.doesNotMatch(clear, /; Domain=/i);
});
