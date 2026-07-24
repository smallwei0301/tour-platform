import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuideSessionCookies } from '../../src/lib/guide-auth.ts';
import { createImpersonationActorCookie } from '../../src/lib/midao/impersonation-actor.ts';
import { resolveMidaoPageSession } from '../../src/lib/midao/page-session.ts';

const guideId = '11111111-1111-4111-8111-111111111111';
const runtime = {
  guideId,
  displayName: 'DB Canonical Guide',
  backendMode: 'midao',
  guideSessionVersion: 7,
  verificationStatus: 'approved',
};

function pair(value) { return value.split(';', 1)[0]; }
function guideCookies(version = 7, name = 'mutable cookie name') {
  return createGuideSessionCookies(guideId, name, version).map(pair).join('; ');
}
function request(cookie = '') {
  return new Request('https://example.test/midao', { headers: cookie ? { cookie } : {} });
}
function options(overrides = {}) {
  return { runtime, flags: { backendEnabled: true }, ...overrides };
}

test('missing or stale session returns a same-origin safe login destination', async () => {
  assert.deepEqual(await resolveMidaoPageSession(request(), options()), {
    kind: 'redirect', reason: 'UNAUTHORIZED', location: '/guide/login?next=%2Fmidao',
  });
  assert.deepEqual(await resolveMidaoPageSession(request(guideCookies(6)), options()), {
    kind: 'redirect', reason: 'SESSION_STALE', location: '/guide/login?next=%2Fmidao',
  });
});

test('inactive guide is denied while legacy mode and disabled backend return to legacy', async () => {
  assert.deepEqual(await resolveMidaoPageSession(request(guideCookies()), options({
    runtime: { ...runtime, verificationStatus: 'suspended' },
  })), { kind: 'denied', reason: 'GUIDE_NOT_ACTIVE', status: 403 });
  assert.deepEqual(await resolveMidaoPageSession(request(guideCookies()), options({
    runtime: { ...runtime, backendMode: 'legacy' },
  })), { kind: 'redirect', reason: 'BACKEND_MODE_MISMATCH', location: '/guide/dashboard' });
  assert.deepEqual(await resolveMidaoPageSession(request(guideCookies()), options({
    flags: { backendEnabled: false },
  })), { kind: 'redirect', reason: 'MIDAO_DISABLED', location: '/guide/dashboard' });
});

test('valid Midao session uses DB guide name and normal guide has no banner', async () => {
  assert.deepEqual(await resolveMidaoPageSession(request(guideCookies()), options()), {
    kind: 'ready',
    session: {
      guideId,
      guideName: 'DB Canonical Guide',
      sessionVersion: 7,
      backendMode: 'midao',
      actorType: 'guide',
      actorId: guideId,
    },
    impersonation: null,
  });
});

test('valid actor produces verified banner state; forged actor fails closed', async () => {
  const actor = pair(createImpersonationActorCookie({
    adminEmail: 'admin@example.invalid', targetGuideId: guideId,
  }));
  const valid = await resolveMidaoPageSession(request(`${guideCookies()}; ${actor}`), options());
  assert.equal(valid.kind, 'ready');
  assert.deepEqual(valid.impersonation, { guideName: 'DB Canonical Guide' });
  assert.equal(valid.session.actorType, 'admin');

  const forged = `${actor.slice(0, -1)}${actor.endsWith('0') ? '1' : '0'}`;
  assert.deepEqual(await resolveMidaoPageSession(request(`${guideCookies()}; ${forged}`), options()), {
    kind: 'redirect', reason: 'UNAUTHORIZED', location: '/guide/login?next=%2Fmidao',
  });
});
