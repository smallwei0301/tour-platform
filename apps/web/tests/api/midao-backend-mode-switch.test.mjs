import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(here, '../../app/api/v2/admin/guides/[guideId]/backend-mode/route.ts');
const { switchGuideBackendModeDb } = await import('../../src/lib/db-midao-backend-mode.mjs');
const { pickAdminCredentials } = await import('../../src/lib/admin-auth.mjs');

function fakeClient(currentMode = 'legacy', rpcResult = { data: { backendMode: 'midao', sessionVersion: 8, changed: true, redirectTo: '/midao' }, error: null }) {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            eq(column, value) {
              calls.push(['eq', column, value]);
              return {
                async maybeSingle() {
                  calls.push(['maybeSingle']);
                  return { data: { id: value, backend_mode: currentMode }, error: null };
                },
              };
            },
          };
        },
      };
    },
    async rpc(name, params) {
      calls.push(['rpc', name, params]);
      return rpcResult;
    },
  };
  return { client, calls };
}

const input = {
  guideId: '11111111-1111-4111-8111-111111111111',
  targetMode: 'midao',
  reason: 'approved rollout',
  actorId: 'admin@example.com',
  requestId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: 'mode-switch-1',
  requestHash: 'a'.repeat(64),
};

test('route derives normalized actor from verified admin credentials and accepts exact body only', () => {
  assert.equal(existsSync(routePath), true, 'D2 backend-mode route must exist');
  const source = readFileSync(routePath, 'utf8');
  assert.match(source, /pickAdminCredentials\(request\)\.email/iu);
  assert.match(source, /trim\(\)\.toLowerCase\(\)/u);
  assert.match(source, /Object\.keys\(body\).*sort/isu);
  assert.match(source, /backendMode.*reason/isu);
  assert.match(source, /parseIdempotencyKey\(request\.headers\.get\(['"]idempotency-key['"]\)\)/iu);
  assert.match(source, /hashIdempotentRequest\(\{\s*backendMode[\s\S]*reason/iu);
  assert.doesNotMatch(source, /body\.(?:actor|actorId|email|token|adminToken)/u);
  assert.doesNotMatch(source, /getSupabase|\.from\(|\.rpc\(/u, 'route must only call the RPC gateway');
});

test('route validates UUID/mode/reason and delegates both directional flags to gateway', () => {
  const source = readFileSync(routePath, 'utf8');
  assert.match(source, /UUID|uuid/u);
  assert.match(source, /legacy.*midao|midao.*legacy/isu);
  assert.match(source, /reason/iu);
  assert.match(source, /isMidaoBackendEnabled\(\)/u);
  assert.match(source, /isMidaoBackendModeSwitchEnabled\(\)/u);
  assert.match(source, /switchGuideBackendModeDb\s*\(/u);
});

test('legacy to midao requires both forward flags before RPC', async () => {
  for (const flags of [
    { backendEnabled: false, modeSwitchEnabled: false },
    { backendEnabled: true, modeSwitchEnabled: false },
    { backendEnabled: false, modeSwitchEnabled: true },
  ]) {
    const { client, calls } = fakeClient('legacy');
    await assert.rejects(
      switchGuideBackendModeDb({ ...input, ...flags, client }),
      (error) => error.code === 'MIDAO_MODE_SWITCH_DISABLED' && error.status === 503,
    );
    assert.equal(calls.some(([kind]) => kind === 'rpc'), false);
  }
});

test('midao to legacy rollback and fresh same-mode remain available with every flag off', async () => {
  const rollback = fakeClient('midao', { data: { backendMode: 'legacy', sessionVersion: 9, changed: true, redirectTo: '/guide/dashboard' }, error: null });
  const rollbackResult = await switchGuideBackendModeDb({
    ...input, targetMode: 'legacy', backendEnabled: false, modeSwitchEnabled: false, client: rollback.client,
  });
  assert.equal(rollbackResult.backendMode, 'legacy');
  assert.equal(rollback.calls.filter(([kind]) => kind === 'rpc').length, 1);

  const same = fakeClient('legacy', { data: { backendMode: 'legacy', sessionVersion: 7, changed: false, redirectTo: '/guide/dashboard' }, error: null });
  const sameResult = await switchGuideBackendModeDb({
    ...input, targetMode: 'legacy', backendEnabled: false, modeSwitchEnabled: false, client: same.client,
  });
  assert.equal(sameResult.changed, false);
  assert.equal(same.calls.filter(([kind]) => kind === 'rpc').length, 1);
});

test('gateway awaits an asynchronous production-style client before canonical read', async () => {
  const asynchronous = fakeClient('legacy');
  const result = await switchGuideBackendModeDb({
    ...input,
    backendEnabled: true,
    modeSwitchEnabled: true,
    client: Promise.resolve(asynchronous.client),
  });
  assert.equal(result.backendMode, 'midao');
  assert.equal(asynchronous.calls.some(([kind]) => kind === 'rpc'), true);
});

test('every target midao request fails closed when forward flags are off, even after stale midao pre-read', async () => {
  const staleRead = fakeClient('midao');
  await assert.rejects(
    switchGuideBackendModeDb({
      ...input,
      targetMode: 'midao',
      backendEnabled: false,
      modeSwitchEnabled: false,
      client: staleRead.client,
    }),
    (error) => error.code === 'MIDAO_MODE_SWITCH_DISABLED' && error.status === 503,
  );
  assert.equal(staleRead.calls.some(([kind]) => kind === 'rpc'), false);
});

test('admin credential resolver exactly mirrors middleware per-field precedence', () => {
  const makeRequest = ({ headerToken = '', headerEmail = '' } = {}) => new Request('https://example.test/api/v2/admin/test', {
    headers: {
      cookie: 'admin_token=cookie-token; admin_email=cookie%40example.com; admin_session_version=7; admin_session_expires_at=9999999999',
      ...(headerToken ? { 'x-admin-token': headerToken } : {}),
      ...(headerEmail ? { 'x-admin-email': headerEmail } : {}),
    },
  });

  assert.deepEqual(pickAdminCredentials(makeRequest({ headerToken: 'header-token', headerEmail: 'header@example.com' })), {
    token: 'header-token', email: 'header@example.com', sessionVersion: null, expiresAt: null, requireSession: false,
  });
  assert.deepEqual(pickAdminCredentials(makeRequest({ headerToken: 'header-token' })), {
    token: 'header-token', email: 'cookie@example.com', sessionVersion: null, expiresAt: null, requireSession: false,
  });
  assert.deepEqual(pickAdminCredentials(makeRequest({ headerEmail: 'header@example.com' })), {
    token: 'cookie-token', email: 'header@example.com', sessionVersion: '7', expiresAt: '9999999999', requireSession: true,
  });
  assert.deepEqual(pickAdminCredentials(makeRequest()), {
    token: 'cookie-token', email: 'cookie@example.com', sessionVersion: '7', expiresAt: '9999999999', requireSession: true,
  });
});

test('gateway sends exact RPC identity/parameters and maps deterministic conflicts', async () => {
  const successful = fakeClient('legacy');
  await switchGuideBackendModeDb({ ...input, backendEnabled: true, modeSwitchEnabled: true, client: successful.client });
  const rpc = successful.calls.find(([kind]) => kind === 'rpc');
  assert.equal(rpc[1], 'midao_switch_guide_backend_mode');
  assert.deepEqual(rpc[2], {
    p_guide_id: input.guideId,
    p_target_mode: input.targetMode,
    p_reason: input.reason,
    p_actor_type: 'admin',
    p_actor_id: input.actorId,
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
  });

  const conflict = fakeClient('legacy', { data: null, error: { message: 'IDEMPOTENCY_KEY_REUSED' } });
  await assert.rejects(
    switchGuideBackendModeDb({ ...input, backendEnabled: true, modeSwitchEnabled: true, client: conflict.client }),
    (error) => error.code === 'IDEMPOTENCY_CONFLICT' && error.status === 409,
  );
});
