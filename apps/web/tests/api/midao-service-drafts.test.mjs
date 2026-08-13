import assert from 'node:assert/strict';
import test from 'node:test';

// #1758 S5 · Task 26 — guide service-draft revision API routes（422/409）測試。
//
// 覆蓋（TDD RED → GREEN）：
//   - GET 取得目前 active 草稿（含無草稿回 draft:null）。
//   - POST 建立／更新草稿（帶 expectedRevision）成功路徑。
//   - POST revision 不符 → HTTP 409，body 帶 currentRevision + 最新 draft 供前端重讀。
//   - POST 問卷驗證失敗 → HTTP 422，body 帶 errors[]。
//   - DELETE 丟棄草稿成功。
//   - DELETE revision 不符 → HTTP 409。
//   - 非本人 activity → HTTP 404（不洩漏「存在但不是你的」）。
//   - auth 缺失 → HTTP 401。
//   - POST 缺 CSRF → HTTP 403。
//   - mutations flag 關 → HTTP 503。
//
// 路由層透過既有 canonical guide session + CSRF + mutations gate 保護，並呼叫 S4 gateway
// （getServiceDraft / upsertServiceDraft / discardServiceDraft）；因為 route 需要真實的
// guide_profiles / activities / guide_service_drafts 查詢，測試以有狀態的 Supabase fake
// 同時餵三張表（session runtime、ownership、gateway parity）。

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const GUIDE_SESSION_SECRET = 'task26-api-test-guide-session-secret-0123456789';
const SESSION_VERSION = 7;
const FIXED_NOW = '2026-07-31T12:00:00.000Z';

process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;

const { createGuideSessionCookies } = await import('../../src/lib/guide-auth.ts');
const { __setSupabaseClientForTest } = await import('../../src/lib/supabase-env.mjs');
const {
  __setMidaoServiceDraftClockForTest,
} = await import('../../src/lib/midao/db-midao-service-drafts.mjs');

let indexRoute = {};
let detailRoute = {};
let routeImportError = null;
try {
  indexRoute = await import('../../app/api/v2/guide/service-drafts/route.ts');
  detailRoute = await import('../../app/api/v2/guide/service-drafts/[draftId]/route.ts');
} catch (error) {
  routeImportError = error;
}

const originalEnv = {
  MIDAO_BACKEND_ENABLED: process.env.MIDAO_BACKEND_ENABLED,
  MIDAO_BACKEND_MUTATIONS_ENABLED: process.env.MIDAO_BACKEND_MUTATIONS_ENABLED,
  MIDAO_LEGACY_DRAFT_MATERIALIZATION_ENABLED: process.env.MIDAO_LEGACY_DRAFT_MATERIALIZATION_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const DRAFT_SELECT_KEYS = [
  'id', 'activity_id', 'guide_id', 'revision', 'status', 'payload', 'updated_at',
  'materialization_origin', 'materialization_review_state',
];

function projectDraft(row) {
  const out = {};
  for (const key of DRAFT_SELECT_KEYS) out[key] = row[key];
  return structuredClone(out);
}

// 有狀態的 Supabase fake：支援 guide_profiles(single)、activities(single)、
// guide_service_drafts(select/update/insert + maybeSingle)。刻意只實作 gateway 與
// ownership／session 真正用到的鏈式呼叫。
function createSupabaseFake({
  drafts = [],
  activityGuideId = GUIDE_ID,
  activityStatus = 'published',
  versions = [],
  runtimeGuideId = GUIDE_ID,
  materialize = null,
  runtimeBackendMode = 'midao',
} = {}) {
  const state = { drafts: drafts.map((d) => structuredClone(d)) };
  const calls = [];

  function draftBuilder() {
    const filters = [];
    let op = 'select';
    let payload = null;
    const builder = {
      select(columns) { calls.push({ type: 'draft-select', columns }); return builder; },
      insert(row) { op = 'insert'; payload = row; return builder; },
      update(patch) { op = 'update'; payload = patch; return builder; },
      eq(field, value) { filters.push([field, value]); return builder; },
      async maybeSingle() {
        if (op === 'insert') {
          const activityId = payload.activity_id;
          const existingActive = state.drafts.find(
            (d) => d.activity_id === activityId && d.status === 'active',
          );
          if (existingActive) {
            return { data: null, error: { code: '23505', message: 'duplicate active draft' } };
          }
          const created = {
            id: `draft-${state.drafts.length + 1}`,
            activity_id: payload.activity_id,
            guide_id: payload.guide_id,
            revision: payload.revision,
            status: payload.status,
            payload: structuredClone(payload.payload ?? {}),
            updated_at: FIXED_NOW,
          };
          state.drafts.push(created);
          return { data: projectDraft(created), error: null };
        }
        const match = (row) => filters.every(([field, value]) => {
          if (field === 'activity_id') return row.activity_id === value;
          if (field === 'status') return row.status === value;
          if (field === 'revision') return row.revision === value;
          return true;
        });
        if (op === 'update') {
          const row = state.drafts.find(match);
          if (!row) return { data: null, error: null };
          // Apply only the fields the gateway actually sent; absent fields
          // (e.g. payload on a discard) keep their existing value.
          for (const [key, value] of Object.entries(payload)) row[key] = value;
          return { data: projectDraft(row), error: null };
        }
        const found = state.drafts.find(match) ?? null;
        return { data: found ? projectDraft(found) : null, error: null };
      },
    };
    return builder;
  }

  const client = {
    from(table) {
      calls.push({ type: 'from', table });
      if (table === 'guide_profiles') {
        const query = {
          select() { return query; },
          eq() { return query; },
          async single() {
            return {
              data: {
                id: runtimeGuideId,
                display_name: 'Canonical Guide',
                backend_mode: runtimeBackendMode,
                guide_session_version: SESSION_VERSION,
                verification_status: 'approved',
              },
              error: null,
            };
          },
        };
        return query;
      }
      if (table === 'activities') {
        const query = {
          _id: null,
          select() { return query; },
          eq(field, value) { if (field === 'id') query._id = value; return query; },
          async single() {
            if (query._id !== ACTIVITY_ID) return { data: null, error: { message: 'not found' } };
            return { data: { id: ACTIVITY_ID, guide_id: activityGuideId, status: activityStatus }, error: null };
          },
          async maybeSingle() {
            if (query._id !== ACTIVITY_ID) return { data: null, error: null };
            return { data: { id: ACTIVITY_ID, guide_id: activityGuideId, status: activityStatus }, error: null };
          },
        };
        return query;
      }
      if (table === 'service_publication_versions') {
        const query = {
          _activityId: null,
          select() { return query; },
          eq(field, value) { if (field === 'activity_id') query._activityId = value; return query; },
          async maybeSingle() {
            const version = versions.find((row) => row.activity_id === query._activityId) ?? null;
            return { data: version ? structuredClone(version) : null, error: null };
          },
        };
        return query;
      }
      if (table === 'guide_service_drafts') {
        return draftBuilder();
      }
      throw new Error(`unexpected table: ${table}`);
    },
    rpc(name, args) {
      calls.push({ type: 'rpc', name, args });
      const response = materialize?.(args) ?? { data: null, error: { code: '42501', message: 'materialization unavailable' } };
      if ((response?.data?.code === 'CREATED' || response?.data?.code === 'REUSED') && !state.drafts.some((row) => row.activity_id === args.p_activity_id && row.status === 'active')) {
        state.drafts.push({
          id: response.data.draftId,
          activity_id: args.p_activity_id,
          guide_id: args.p_guide_id,
          revision: response.data.revision,
          status: 'active',
          payload: { name: 'legacy materialized' },
          updated_at: FIXED_NOW,
        });
      }
      return Promise.resolve(response);
    },
  };
  return { client, calls, state };
}

function cookieHeader(cookies) {
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

function guideCookies(guideId = GUIDE_ID) {
  return cookieHeader(createGuideSessionCookies(guideId, 'Cookie Guide', SESSION_VERSION));
}

function getRequest(query = `?activityId=${ACTIVITY_ID}`, { authenticated = true } = {}) {
  return new Request(`https://example.test/api/v2/guide/service-drafts${query}`, {
    headers: authenticated ? { cookie: guideCookies() } : {},
  });
}

function postRequest(body, { authenticated = true, csrf = 'csrf-value' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (authenticated) {
    headers.cookie = csrf ? `${guideCookies()}; tp_csrf=${csrf}` : guideCookies();
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  return new Request('https://example.test/api/v2/guide/service-drafts', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function deleteRequest(draftId, body, { authenticated = true, csrf = 'csrf-value' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (authenticated) {
    headers.cookie = csrf ? `${guideCookies()}; tp_csrf=${csrf}` : guideCookies();
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  return new Request(`https://example.test/api/v2/guide/service-drafts/${draftId}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify(body),
  });
}

async function payload(response) {
  return { status: response.status, body: await response.json() };
}

function callGet(request) {
  return indexRoute.GET(request);
}
function callPost(request) {
  return indexRoute.POST(request);
}
function callDelete(request, draftId) {
  return detailRoute.DELETE(request, { params: Promise.resolve({ draftId }) });
}

function seedActiveDraft(overrides = {}) {
  return {
    id: 'draft-seed',
    activity_id: ACTIVITY_ID,
    guide_id: GUIDE_ID,
    revision: 3,
    status: 'active',
    payload: { name: '祕島夜潛', descriptions: ['含裝備'] },
    updated_at: FIXED_NOW,
    ...overrides,
  };
}

function installEnv(fake) {
  process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;
  process.env.MIDAO_BACKEND_ENABLED = '1';
  process.env.MIDAO_BACKEND_MUTATIONS_ENABLED = '1';
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(fake.client);
  __setMidaoServiceDraftClockForTest(FIXED_NOW);
}

test.afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  __setSupabaseClientForTest(null);
  __setMidaoServiceDraftClockForTest(null);
});

test('routes import cleanly and export their HTTP methods', () => {
  assert.equal(routeImportError, null, routeImportError ? String(routeImportError && routeImportError.stack) : 'import ok');
  assert.equal(typeof indexRoute.GET, 'function');
  assert.equal(typeof indexRoute.POST, 'function');
  assert.equal(typeof detailRoute.DELETE, 'function');
});

test('GET returns the active draft for the owning guide', async () => {
  const fake = createSupabaseFake({ drafts: [seedActiveDraft()] });
  installEnv(fake);
  const { status, body } = await payload(await callGet(getRequest()));
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.draft.revision, 3);
  assert.equal(body.data.draft.status, 'active');
  assert.equal(body.data.draft.activityId, ACTIVITY_ID);
  assert.equal(body.data.draft.payload.name, '祕島夜潛');
});

test('GET projects legacy provenance and defaults absent provenance to native', async () => {
  const legacyFake = createSupabaseFake({
    drafts: [seedActiveDraft({
      materialization_origin: 'legacy_activity',
      materialization_review_state: 'needs_review',
    })],
  });
  installEnv(legacyFake);
  const legacy = await payload(await callGet(getRequest()));
  assert.equal(legacy.status, 200);
  assert.equal(legacy.body.data.draft.materializationOrigin, 'legacy_activity');
  assert.equal(legacy.body.data.draft.materializationReviewState, 'needs_review');
  assert.ok(legacyFake.calls.some((call) => call.type === 'draft-select'
    && call.columns.includes('materialization_origin, materialization_review_state')));

  const nativeFake = createSupabaseFake({ drafts: [seedActiveDraft()] });
  installEnv(nativeFake);
  const native = await payload(await callGet(getRequest()));
  assert.equal(native.status, 200);
  assert.equal(native.body.data.draft.materializationOrigin, 'native');
  assert.equal(native.body.data.draft.materializationReviewState, null);
});

test('GET with no active draft returns draft:null', async () => {
  const fake = createSupabaseFake({ drafts: [] });
  installEnv(fake);
  const { status, body } = await payload(await callGet(getRequest()));
  assert.equal(status, 200);
  assert.equal(body.data.draft, null);
});

test('GET materializes an owned published activity and returns the materialized active draft', async () => {
  const fake = createSupabaseFake({
    drafts: [],
    materialize: () => ({
      data: {
        code: 'CREATED',
        activityId: ACTIVITY_ID,
        draftId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        revision: 1,
      },
      error: null,
    }),
  });
  installEnv(fake);
  process.env.MIDAO_LEGACY_DRAFT_MATERIALIZATION_ENABLED = '1';
  process.env.NODE_ENV = 'test';
  const { status, body } = await payload(await callGet(getRequest()));
  assert.equal(status, 200);
  assert.equal(body.data.draft.revision, 1);
  assert.equal(body.data.draft.payload.name, 'legacy materialized');
  assert.deepEqual(fake.calls.filter((call) => call.type === 'rpc'), [{
    type: 'rpc',
    name: 'midao_materialize_legacy_service_draft',
    args: { p_activity_id: ACTIVITY_ID, p_guide_id: GUIDE_ID },
  }]);
});

test('GET materializes an owned published activity without a draft and returns explicit failure when the RPC rejects', async () => {
  const fake = createSupabaseFake({ drafts: [] });
  installEnv(fake);
  process.env.MIDAO_LEGACY_DRAFT_MATERIALIZATION_ENABLED = '1';
  process.env.NODE_ENV = 'test';
  const { status, body } = await payload(await callGet(getRequest()));
  assert.equal(status, 500);
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.deepEqual(fake.calls.filter((call) => call.type === 'rpc'), [{
    type: 'rpc',
    name: 'midao_materialize_legacy_service_draft',
    args: { p_activity_id: ACTIVITY_ID, p_guide_id: GUIDE_ID },
  }]);
});

test('GET missing auth returns 401', async () => {
  const fake = createSupabaseFake({ drafts: [seedActiveDraft()] });
  installEnv(fake);
  const { status, body } = await payload(await callGet(getRequest(undefined, { authenticated: false })));
  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('GET for an activity owned by another guide collapses to 404', async () => {
  const fake = createSupabaseFake({ drafts: [], activityGuideId: OTHER_GUIDE_ID });
  installEnv(fake);
  const { status, body } = await payload(await callGet(getRequest()));
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('POST creates a new draft with revision 1 and the session guide id', async () => {
  const fake = createSupabaseFake({ drafts: [] });
  installEnv(fake);
  const request = postRequest({
    activityId: ACTIVITY_ID,
    expectedRevision: 0,
    patch: { name: '新草稿', descriptions: ['一段說明'] },
  });
  const { status, body } = await payload(await callPost(request));
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.draft.revision, 1);
  assert.equal(body.data.draft.status, 'active');
  assert.equal(body.data.draft.guideId, GUIDE_ID);
  assert.equal(body.data.draft.payload.name, '新草稿');
});

test('POST updates an existing draft when the expected revision matches', async () => {
  const fake = createSupabaseFake({ drafts: [seedActiveDraft({ revision: 3 })] });
  installEnv(fake);
  const request = postRequest({
    activityId: ACTIVITY_ID,
    expectedRevision: 3,
    patch: { name: '更新後名稱' },
  });
  const { status, body } = await payload(await callPost(request));
  assert.equal(status, 200);
  assert.equal(body.data.draft.revision, 4);
  assert.equal(body.data.draft.payload.name, '更新後名稱');
});

test('POST with a stale expected revision returns 409 with the latest version', async () => {
  const fake = createSupabaseFake({ drafts: [seedActiveDraft({ revision: 5 })] });
  installEnv(fake);
  const request = postRequest({
    activityId: ACTIVITY_ID,
    expectedRevision: 3,
    patch: { name: '會衝突' },
  });
  const { status, body } = await payload(await callPost(request));
  assert.equal(status, 409);
  assert.equal(body.error.code, 'REVISION_CONFLICT');
  assert.equal(body.currentRevision, 5);
  assert.equal(body.draft.revision, 5);
  assert.equal(body.draft.payload.name, '祕島夜潛');
});

test('POST with an invalid questionnaire returns 422 with errors[]', async () => {
  const fake = createSupabaseFake({ drafts: [] });
  installEnv(fake);
  const request = postRequest({
    activityId: ACTIVITY_ID,
    expectedRevision: 0,
    patch: {
      name: '草稿',
      questions: [{ question_key: 'x', label: 'x', type: 'not_a_real_type', options: [], sort_order: 0 }],
    },
  });
  const { status, body } = await payload(await callPost(request));
  assert.equal(status, 422);
  assert.equal(body.error.code, 'INVALID_QUESTIONNAIRE');
  assert.ok(Array.isArray(body.errors));
  assert.ok(body.errors.length >= 1);
});

test('POST for another guide activity collapses to 404 before touching the gateway', async () => {
  const fake = createSupabaseFake({ drafts: [], activityGuideId: OTHER_GUIDE_ID });
  installEnv(fake);
  const request = postRequest({ activityId: ACTIVITY_ID, expectedRevision: 0, patch: { name: 'x' } });
  const { status, body } = await payload(await callPost(request));
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.equal(fake.state.drafts.length, 0);
});

test('POST missing CSRF returns 403', async () => {
  const fake = createSupabaseFake({ drafts: [] });
  installEnv(fake);
  const request = postRequest({ activityId: ACTIVITY_ID, expectedRevision: 0, patch: { name: 'x' } }, { csrf: '' });
  const { status, body } = await payload(await callPost(request));
  assert.equal(status, 403);
  assert.ok(/CSRF/u.test(body.error.code));
});

test('POST returns 503 when mutations flag is off', async () => {
  const fake = createSupabaseFake({ drafts: [] });
  installEnv(fake);
  process.env.MIDAO_BACKEND_MUTATIONS_ENABLED = '0';
  const request = postRequest({ activityId: ACTIVITY_ID, expectedRevision: 0, patch: { name: 'x' } });
  const { status, body } = await payload(await callPost(request));
  assert.equal(status, 503);
  assert.equal(body.error.code, 'MUTATIONS_DISABLED');
});

test('DELETE discards the active draft when the expected revision matches', async () => {
  const fake = createSupabaseFake({ drafts: [seedActiveDraft({ revision: 3 })] });
  installEnv(fake);
  const request = deleteRequest(ACTIVITY_ID, { expectedRevision: 3 });
  const { status, body } = await payload(await callDelete(request, ACTIVITY_ID));
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.draft.status, 'discarded');
});

test('DELETE with a stale expected revision returns 409', async () => {
  const fake = createSupabaseFake({ drafts: [seedActiveDraft({ revision: 5 })] });
  installEnv(fake);
  const request = deleteRequest(ACTIVITY_ID, { expectedRevision: 2 });
  const { status, body } = await payload(await callDelete(request, ACTIVITY_ID));
  assert.equal(status, 409);
  assert.equal(body.error.code, 'REVISION_CONFLICT');
  assert.equal(body.currentRevision, 5);
});

test('DELETE for another guide activity collapses to 404', async () => {
  const fake = createSupabaseFake({ drafts: [seedActiveDraft()], activityGuideId: OTHER_GUIDE_ID });
  installEnv(fake);
  const request = deleteRequest(ACTIVITY_ID, { expectedRevision: 3 });
  const { status, body } = await payload(await callDelete(request, ACTIVITY_ID));
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('DELETE missing auth returns 401', async () => {
  const fake = createSupabaseFake({ drafts: [seedActiveDraft()] });
  installEnv(fake);
  const request = deleteRequest(ACTIVITY_ID, { expectedRevision: 3 }, { authenticated: false });
  const { status, body } = await payload(await callDelete(request, ACTIVITY_ID));
  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});
