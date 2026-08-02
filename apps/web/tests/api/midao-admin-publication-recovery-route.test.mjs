import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_TOKEN = 'admin-token-1758';
const ADMIN_EMAIL = 'admin@example.com';
const CSRF = 'csrf-1758';
const LIST_ROUTE_PATH = path.resolve(
  ROOT,
  'app/api/v2/admin/activities/[activityId]/publication-versions/route.ts',
);
const RESTORE_ROUTE_PATH = path.resolve(
  ROOT,
  'app/api/v2/admin/activities/[activityId]/commands/restore-publication/route.ts',
);
const GATEWAY_PATH = path.resolve(ROOT, 'src/lib/admin/midao-publication-recovery.mjs');
const SUPABASE_ENV_PATH = path.resolve(ROOT, 'src/lib/supabase-env.mjs');

async function importFresh(file) {
  return import(`${pathToFileURL(file).href}?t=${Date.now()}-${Math.random()}`);
}

function adminHeaders({ csrf = false, actorEmail = ADMIN_EMAIL } = {}) {
  const headers = {
    'x-admin-token': ADMIN_TOKEN,
    'x-admin-email': actorEmail,
  };
  if (csrf) {
    headers.cookie = `tp_csrf=${encodeURIComponent(CSRF)}`;
    headers['x-csrf-token'] = CSRF;
  }
  return headers;
}

function createSupabaseMock({
  activity = { id: ACTIVITY_ID },
  activityError = null,
  versions = [],
  versionsError = null,
  rpcData = null,
  rpcError = null,
  rpcThrows = null,
} = {}) {
  const state = { fromCalls: [], queries: [], rpcCalls: [] };

  return {
    state,
    from(table) {
      state.fromCalls.push(table);
      if (table === 'activities') {
        const query = {
          select(columns) {
            state.queries.push({ table, operation: 'select', columns });
            return query;
          },
          eq(column, value) {
            state.queries.push({ table, operation: 'eq', column, value });
            return query;
          },
          maybeSingle() {
            state.queries.push({ table, operation: 'maybeSingle' });
            return Promise.resolve({ data: activity, error: activityError });
          },
        };
        return query;
      }
      if (table === 'service_publication_versions') {
        const query = {
          select(columns) {
            state.queries.push({ table, operation: 'select', columns });
            return query;
          },
          eq(column, value) {
            state.queries.push({ table, operation: 'eq', column, value });
            return query;
          },
          order(column, options) {
            state.queries.push({ table, operation: 'order', column, options });
            return Promise.resolve({ data: versions, error: versionsError });
          },
        };
        return query;
      }
      throw new Error(`unexpected table: ${table}`);
    },
    async rpc(name, args) {
      state.rpcCalls.push({ name, args: structuredClone(args) });
      if (rpcThrows) throw rpcThrows;
      return { data: rpcData, error: rpcError };
    },
  };
}

async function withAdminEnv(fn) {
  const previousToken = process.env.ADMIN_ACCESS_TOKEN;
  const previousAllowlist = process.env.ADMIN_EMAIL_ALLOWLIST;
  process.env.ADMIN_ACCESS_TOKEN = ADMIN_TOKEN;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
  try {
    return await fn();
  } finally {
    if (previousToken === undefined) delete process.env.ADMIN_ACCESS_TOKEN;
    else process.env.ADMIN_ACCESS_TOKEN = previousToken;
    if (previousAllowlist === undefined) delete process.env.ADMIN_EMAIL_ALLOWLIST;
    else process.env.ADMIN_EMAIL_ALLOWLIST = previousAllowlist;
  }
}

async function withoutAdminEnv(fn) {
  const previousToken = process.env.ADMIN_ACCESS_TOKEN;
  const previousAllowlist = process.env.ADMIN_EMAIL_ALLOWLIST;
  delete process.env.ADMIN_ACCESS_TOKEN;
  delete process.env.ADMIN_EMAIL_ALLOWLIST;
  try {
    return await fn();
  } finally {
    if (previousToken !== undefined) process.env.ADMIN_ACCESS_TOKEN = previousToken;
    if (previousAllowlist !== undefined) process.env.ADMIN_EMAIL_ALLOWLIST = previousAllowlist;
  }
}

async function withSupabase(mock, fn) {
  const supabaseEnv = await import(pathToFileURL(SUPABASE_ENV_PATH).href);
  supabaseEnv.__setSupabaseClientForTest(mock);
  try {
    return await fn();
  } finally {
    supabaseEnv.__setSupabaseClientForTest(null);
  }
}

function routeContext() {
  return { params: Promise.resolve({ activityId: ACTIVITY_ID }) };
}

function listRequest({ authenticated = true } = {}) {
  return new Request(
    `https://example.test/api/v2/admin/activities/${ACTIVITY_ID}/publication-versions`,
    { headers: authenticated ? adminHeaders() : {} },
  );
}

function restoreRequest(body, {
  authenticated = true,
  csrf = true,
  actorEmail = ADMIN_EMAIL,
  idempotencyKey = 'restore-publication-2',
} = {}) {
  return new Request(
    `https://example.test/api/v2/admin/activities/${ACTIVITY_ID}/commands/restore-publication`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        ...(authenticated ? adminHeaders({ csrf, actorEmail }) : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

const RESTORED_PAYLOAD = {
  restored: true,
  code: 'RESTORED',
  activityId: ACTIVITY_ID,
  sourceVersion: 2,
  version: 4,
  status: 'published',
};

test('source contract uses canonical admin guard/v2 helpers and only the approved restore RPC', () => {
  const listSource = readFileSync(LIST_ROUTE_PATH, 'utf8');
  const restoreSource = readFileSync(RESTORE_ROUTE_PATH, 'utf8');
  const gatewaySource = readFileSync(GATEWAY_PATH, 'utf8');

  for (const source of [listSource, restoreSource]) {
    assert.match(source, /pickAdminCredentials/);
    assert.match(source, /isAdminAuthorized/);
    assert.match(source, /getAdminSecurityState/);
    assert.match(source, /getRequiredAdminToken/);
    assert.match(source, /getAdminAuthEnv/);
    assert.doesNotMatch(source, /process\.env/);
    assert.match(source, /jsonOk/);
    assert.match(source, /jsonError/);
  }
  assert.match(restoreSource, /validateCsrf/);
  assert.match(restoreSource, /parseIdempotencyKey\(request\.headers\.get\(['"]idempotency-key['"]\)\)/);
  assert.match(restoreSource, /hashIdempotentRequest\(\{\s*sourceVersion/);
  assert.match(gatewaySource, /rpc\('midao_restore_service_publication'/);
  assert.doesNotMatch(gatewaySource, /\.(?:insert|upsert|delete)\(/);
  assert.doesNotMatch(gatewaySource, /\.from\([^)]*\)[\s\S]{0,200}\.update\(/);
});

test('GET and POST remain fail-closed when canonical admin env is missing', async () => withoutAdminEnv(async () => {
  const mock = createSupabaseMock({ rpcData: RESTORED_PAYLOAD });
  await withSupabase(mock, async () => {
    const listRoute = await importFresh(LIST_ROUTE_PATH);
    const restoreRoute = await importFresh(RESTORE_ROUTE_PATH);
    const listResponse = await listRoute.GET(listRequest(), routeContext());
    const restoreResponse = await restoreRoute.POST(
      restoreRequest({ sourceVersion: 2 }),
      routeContext(),
    );

    assert.equal(listResponse.status, 401);
    assert.equal((await listResponse.json()).error.code, 'UNAUTHORIZED');
    assert.equal(restoreResponse.status, 401);
    assert.equal((await restoreResponse.json()).error.code, 'UNAUTHORIZED');
    assert.deepEqual(mock.state.fromCalls, []);
    assert.deepEqual(mock.state.rpcCalls, []);
  });
}));

test('GET denies unauthenticated access before any DB call', async () => withAdminEnv(async () => {
  const mock = createSupabaseMock();
  await withSupabase(mock, async () => {
    const route = await importFresh(LIST_ROUTE_PATH);
    const response = await route.GET(listRequest({ authenticated: false }), routeContext());
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
    assert.deepEqual(mock.state.fromCalls, []);
    assert.deepEqual(mock.state.rpcCalls, []);
  });
}));

test('GET validates canonical activityId before DB access', async () => withAdminEnv(async () => {
  const mock = createSupabaseMock();
  await withSupabase(mock, async () => {
    const route = await importFresh(LIST_ROUTE_PATH);
    const response = await route.GET(listRequest(), {
      params: Promise.resolve({ activityId: 'not-a-uuid' }),
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, 'INVALID_ACTIVITY_ID');
    assert.deepEqual(mock.state.fromCalls, []);
  });
}));

test('GET returns deterministic minimal immutable metadata without snapshot leakage', async () => withAdminEnv(async () => {
  const mock = createSupabaseMock({
    versions: [
      { version: 3, source_version: 1, published_at: '2026-08-02T01:02:03.000Z' },
      { version: 2, source_version: null, published_at: '2026-08-01T01:02:03.000Z' },
    ],
  });
  await withSupabase(mock, async () => {
    const route = await importFresh(LIST_ROUTE_PATH);
    const response = await route.GET(listRequest(), routeContext());
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(json, {
      success: true,
      data: {
        activityId: ACTIVITY_ID,
        versions: [
          { version: 3, sourceVersion: 1, publishedAt: '2026-08-02T01:02:03.000Z' },
          { version: 2, sourceVersion: null, publishedAt: '2026-08-01T01:02:03.000Z' },
        ],
      },
    });
    assert.equal(JSON.stringify(json).includes('snapshot'), false);
    assert.deepEqual(mock.state.queries.find((entry) => entry.table === 'service_publication_versions' && entry.operation === 'select'), {
      table: 'service_publication_versions',
      operation: 'select',
      columns: 'version, published_at, source_version:snapshot->sourceVersion',
    });
    assert.deepEqual(mock.state.queries.at(-1), {
      table: 'service_publication_versions',
      operation: 'order',
      column: 'version',
      options: { ascending: false },
    });
  });
}));

test('GET maps a missing activity to 404 and unknown DB errors to 500', async (t) => {
  await t.test('missing activity', async () => withAdminEnv(async () => {
    const mock = createSupabaseMock({ activity: null });
    await withSupabase(mock, async () => {
      const route = await importFresh(LIST_ROUTE_PATH);
      const response = await route.GET(listRequest(), routeContext());
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error.code, 'ACTIVITY_NOT_FOUND');
    });
  }));

  await t.test('unknown DB error', async () => withAdminEnv(async () => {
    const mock = createSupabaseMock({ activityError: { code: 'XX999', message: 'database unavailable' } });
    await withSupabase(mock, async () => {
      const route = await importFresh(LIST_ROUTE_PATH);
      const response = await route.GET(listRequest(), routeContext());
      assert.equal(response.status, 500);
      assert.equal((await response.json()).error.code, 'INTERNAL_ERROR');
      assert.notEqual(response.status, 409);
    });
  }));
});

test('POST denies unauthenticated and CSRF-invalid requests before RPC', async (t) => {
  await t.test('unauthenticated', async () => withAdminEnv(async () => {
    const mock = createSupabaseMock({ rpcData: RESTORED_PAYLOAD });
    await withSupabase(mock, async () => {
      const route = await importFresh(RESTORE_ROUTE_PATH);
      const response = await route.POST(
        restoreRequest({ sourceVersion: 2 }, { authenticated: false }),
        routeContext(),
      );
      assert.equal(response.status, 401);
      assert.deepEqual(mock.state.rpcCalls, []);
    });
  }));

  await t.test('missing CSRF', async () => withAdminEnv(async () => {
    const mock = createSupabaseMock({ rpcData: RESTORED_PAYLOAD });
    await withSupabase(mock, async () => {
      const route = await importFresh(RESTORE_ROUTE_PATH);
      const response = await route.POST(
        restoreRequest({ sourceVersion: 2 }, { csrf: false }),
        routeContext(),
      );
      assert.equal(response.status, 403);
      assert.deepEqual(mock.state.rpcCalls, []);
    });
  }));
});

test('POST validates activityId, sourceVersion, idempotency key, and JSON body with zero RPC calls', async (t) => {
  const cases = [
    ['bad activity', { sourceVersion: 2 }, 'not-a-uuid', {}],
    ['bad sourceVersion', { sourceVersion: 0 }, ACTIVITY_ID, {}],
    ['bad idempotency key', { sourceVersion: 2 }, ACTIVITY_ID, { idempotencyKey: '' }],
    ['actor fields forbidden in body', { sourceVersion: 2, actorType: 'guide', actorId: 'attacker@example.test' }, ACTIVITY_ID, {}],
  ];
  for (const [name, body, activityId, options] of cases) {
    await t.test(name, async () => withAdminEnv(async () => {
      const mock = createSupabaseMock({ rpcData: RESTORED_PAYLOAD });
      await withSupabase(mock, async () => {
        const route = await importFresh(RESTORE_ROUTE_PATH);
        const response = await route.POST(restoreRequest(body, options), {
          params: Promise.resolve({ activityId }),
        });
        assert.equal(response.status, 422);
        assert.deepEqual(mock.state.rpcCalls, []);
      });
    }));
  }

  await t.test('invalid JSON', async () => withAdminEnv(async () => {
    const mock = createSupabaseMock({ rpcData: RESTORED_PAYLOAD });
    await withSupabase(mock, async () => {
      const route = await importFresh(RESTORE_ROUTE_PATH);
      const request = new Request(
        `https://example.test/api/v2/admin/activities/${ACTIVITY_ID}/commands/restore-publication`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'invalid-json',
            ...adminHeaders({ csrf: true }),
          },
          body: '{',
        },
      );
      const response = await route.POST(request, routeContext());
      assert.equal(response.status, 422);
      assert.deepEqual(mock.state.rpcCalls, []);
    });
  }));
});

test('POST derives the admin actor server-side and calls the restore RPC with exact stable args', async () => withAdminEnv(async () => {
  const mock = createSupabaseMock({ rpcData: RESTORED_PAYLOAD });
  await withSupabase(mock, async () => {
    const route = await importFresh(RESTORE_ROUTE_PATH);
    const response = await route.POST(restoreRequest({ sourceVersion: 2 }), routeContext());
    const json = await response.json();
    const expectedHash = createHash('sha256')
      .update(JSON.stringify({ sourceVersion: 2 }))
      .digest('hex');

    assert.equal(response.status, 200);
    assert.deepEqual(json, { success: true, data: RESTORED_PAYLOAD });
    assert.deepEqual(mock.state.rpcCalls, [{
      name: 'midao_restore_service_publication',
      args: {
        p_activity_id: ACTIVITY_ID,
        p_source_version: 2,
        p_actor_type: 'admin',
        p_actor_id: ADMIN_EMAIL,
        p_idempotency_key: 'restore-publication-2',
        p_request_hash: expectedHash,
      },
    }]);
  });
}));

test('POST stable replay preserves the RPC success payload and request hash', async () => withAdminEnv(async () => {
  const mock = createSupabaseMock({ rpcData: RESTORED_PAYLOAD });
  await withSupabase(mock, async () => {
    const route = await importFresh(RESTORE_ROUTE_PATH);
    const first = await route.POST(
      restoreRequest({ sourceVersion: 2 }, { idempotencyKey: 'stable-replay' }),
      routeContext(),
    );
    const second = await route.POST(
      restoreRequest({ sourceVersion: 2 }, { idempotencyKey: 'stable-replay' }),
      routeContext(),
    );
    assert.deepEqual(await first.json(), await second.json());
    assert.equal(mock.state.rpcCalls.length, 2);
    assert.equal(mock.state.rpcCalls[0].args.p_request_hash, mock.state.rpcCalls[1].args.p_request_hash);
  });
}));

test('POST maps missing activity/source to 404 and idempotency hash conflict to 409', async (t) => {
  const cases = [
    ['ACTIVITY_NOT_FOUND', 404],
    ['SOURCE_VERSION_NOT_FOUND', 404],
    ['IDEMPOTENCY_CONFLICT', 409],
  ];
  for (const [message, status] of cases) {
    await t.test(message, async () => withAdminEnv(async () => {
      const mock = createSupabaseMock({ rpcError: { code: 'P0001', message } });
      await withSupabase(mock, async () => {
        const route = await importFresh(RESTORE_ROUTE_PATH);
        const response = await route.POST(
          restoreRequest({ sourceVersion: 2 }, { idempotencyKey: `case-${message}` }),
          routeContext(),
        );
        assert.equal(response.status, status);
        assert.equal((await response.json()).error.code, message);
      });
    }));
  }
});

test('POST maps unknown DB errors to 500, never false success or conflict', async () => withAdminEnv(async () => {
  const mock = createSupabaseMock({ rpcError: { code: 'XX999', message: 'database unavailable' } });
  await withSupabase(mock, async () => {
    const route = await importFresh(RESTORE_ROUTE_PATH);
    const response = await route.POST(
      restoreRequest({ sourceVersion: 2 }, { idempotencyKey: 'unknown-error' }),
      routeContext(),
    );
    const json = await response.json();
    assert.equal(response.status, 500);
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'INTERNAL_ERROR');
    assert.notEqual(response.status, 409);
  });
}));
