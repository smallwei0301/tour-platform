import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuideSessionCookies } from '../../src/lib/guide-auth.ts';
import { createImpersonationActorCookie } from '../../src/lib/midao/impersonation-actor.ts';

const dbModule = await import('../../src/lib/midao/db-runtime-access.mjs');
const guardModule = await import('../../src/lib/midao/canonical-guide-session.ts');
const { getGuideRuntimeAccessDb } = dbModule;
const {
  MidaoRuntimeAccessError,
  assertMidaoRuntimeAccess,
  verifyCanonicalGuideSession,
} = guardModule;

const guideId = '11111111-1111-4111-8111-111111111111';
const baseRuntime = {
  guideId,
  displayName: 'DB Canonical Name',
  backendMode: 'midao',
  guideSessionVersion: 7,
  verificationStatus: 'approved',
};

function cookiePair(setCookie) {
  return setCookie.split(';')[0];
}

function guideCookieHeader(version = 7, name = 'Public Cookie Name', options = {}) {
  return createGuideSessionCookies(guideId, name, version, false, options)
    .map(cookiePair)
    .join('; ');
}

function requestWithCookies(cookie = '') {
  return new Request('https://example.test/api/v2/guide/runtime', {
    headers: cookie ? { cookie } : {},
  });
}

function expectAccessError(code, status) {
  return (error) => {
    assert.ok(error instanceof MidaoRuntimeAccessError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  };
}

test('DB gateway uses the exact canonical projection and maps one guide row', async () => {
  const seen = {};
  const chain = {
    select(columns) { seen.columns = columns; return this; },
    eq(column, value) { seen.eq = [column, value]; return this; },
    async single() {
      return {
        data: {
          id: guideId,
          display_name: 'DB Canonical Name',
          backend_mode: 'midao',
          guide_session_version: 7,
          verification_status: 'approved',
        },
        error: null,
      };
    },
  };
  const client = { from(table) { seen.table = table; return chain; } };
  const runtime = await getGuideRuntimeAccessDb({ guideId, client });
  assert.equal(seen.table, 'guide_profiles');
  assert.equal(seen.columns, 'id, display_name, backend_mode, guide_session_version, verification_status');
  assert.deepEqual(seen.eq, ['id', guideId]);
  assert.deepEqual(runtime, baseRuntime);
});

test('invalid HMAC fails 401 before runtime access', async () => {
  await assert.rejects(
    verifyCanonicalGuideSession(requestWithCookies('guide_token=forged.1.signature'), {
      requireMode: true,
      runtime: baseRuntime,
      flags: { backendEnabled: true },
    }),
    expectAccessError('UNAUTHORIZED', 401),
  );
});

test('version, approval, backend flag, and mode gates return deterministic errors', () => {
  const session = { guideId, guideName: 'cookie name', sessionVersion: 7 };
  assert.throws(() => assertMidaoRuntimeAccess({
    session: { ...session, sessionVersion: 6 }, runtime: baseRuntime,
    flags: { backendEnabled: true }, impersonation: { present: false, actor: null }, requireMode: true,
  }), expectAccessError('SESSION_STALE', 401));
  assert.throws(() => assertMidaoRuntimeAccess({
    session, runtime: { ...baseRuntime, verificationStatus: 'suspended' },
    flags: { backendEnabled: true }, impersonation: { present: false, actor: null }, requireMode: true,
  }), expectAccessError('GUIDE_NOT_ACTIVE', 403));
  assert.throws(() => assertMidaoRuntimeAccess({
    session, runtime: baseRuntime,
    flags: { backendEnabled: false }, impersonation: { present: false, actor: null }, requireMode: true,
  }), expectAccessError('MIDAO_DISABLED', 503));
  assert.throws(() => assertMidaoRuntimeAccess({
    session, runtime: { ...baseRuntime, backendMode: 'legacy' },
    flags: { backendEnabled: true }, impersonation: { present: false, actor: null }, requireMode: true,
  }), expectAccessError('BACKEND_MODE_MISMATCH', 409));
});

test('canonical context uses DB display_name, never mutable guide_name cookie', async () => {
  const context = await verifyCanonicalGuideSession(requestWithCookies(guideCookieHeader()), {
    requireMode: true,
    runtime: baseRuntime,
    flags: { backendEnabled: true },
  });
  assert.equal(context.guideName, 'DB Canonical Name');
  assert.notEqual(context.guideName, 'Public Cookie Name');
  assert.deepEqual({ actorType: context.actorType, actorId: context.actorId }, {
    actorType: 'guide', actorId: guideId,
  });
});

test('valid signed impersonation becomes admin actor bound to target guide', async () => {
  const actorPair = cookiePair(createImpersonationActorCookie({
    adminEmail: 'ADMIN@EXAMPLE.COM',
    targetGuideId: guideId,
  }));
  const request = requestWithCookies(`${guideCookieHeader(7, 'Public Cookie Name', {
    sessionKind: 'admin-impersonation',
    maxAgeSeconds: 60 * 60,
  })}; ${actorPair}`);
  const context = await verifyCanonicalGuideSession(request, {
    requireMode: true,
    runtime: baseRuntime,
    flags: { backendEnabled: true },
  });
  assert.equal(context.actorType, 'admin');
  assert.equal(context.actorId, 'admin@example.com');
});

test('present but forged actor cookie fails 401 and cannot fall back to guide actor', async () => {
  const actorPair = cookiePair(createImpersonationActorCookie({
    adminEmail: 'admin@example.com',
    targetGuideId: guideId,
  }));
  const forged = `${actorPair.slice(0, -1)}${actorPair.endsWith('0') ? '1' : '0'}`;
  const request = requestWithCookies(`${guideCookieHeader()}; ${forged}`);
  await assert.rejects(
    verifyCanonicalGuideSession(request, {
      requireMode: true,
      runtime: baseRuntime,
      flags: { backendEnabled: true },
    }),
    expectAccessError('UNAUTHORIZED', 401),
  );
});
