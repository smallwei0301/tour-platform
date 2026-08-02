import assert from 'node:assert/strict';
import test from 'node:test';

// #1758 S7 · Task 28 — 服務草稿「一鍵發布」gateway + route 測試（TDD RED → GREEN）。
//
// 覆蓋（依 Pandora S7 spec）：
//   Gateway（in-memory parity）
//     - 正常發布成功（草稿清除、版本遞增、回 publicUrl）。
//     - REVISION_CONFLICT（expectedRevision 落後）。
//     - SLUG_COLLISION（草稿內兩個 plan 帶相同明確 slug）。
//     - VALIDATION_FAILED（草稿不完整）。
//     - Idempotent replay（同 revision 重複呼叫得相同成功結果，不重複寫入 / 版本不再遞增）。
//     - Ownership 不符 → OWNERSHIP_MISMATCH。
//     - 找不到可發布草稿 → DRAFT_NOT_FOUND。
//   Gateway（Supabase parity）
//     - 呼叫 S6 RPC 成功 → 回 publicUrl / version。
//     - RPC 回 REVISION_CONFLICT / slug 衝突（23505）分類正確。
//   Route（HTTP 映射）
//     - 成功 200、REVISION_CONFLICT 409、SLUG_COLLISION 409、VALIDATION_FAILED 422、
//       ownership 404、auth 401、CSRF 403、mutations flag 503。

const ACTIVITY_ID = '55555555-5555-4555-8555-555555555555';
const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GUIDE_SESSION_SECRET = 'task28-publish-test-guide-session-secret-0123456789';
const SESSION_VERSION = 7;
const FIXED_NOW = '2026-08-01T12:00:00.000Z';

process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;

const gateway = await import('../../src/lib/midao/db-midao-service-publication.mjs');
const {
  publishServiceDraft,
  __resetMidaoServicePublicationStoreForTest,
  __seedMidaoServicePublicationDraftForTest,
  __seedMidaoServicePublicationActivityForTest,
  __seedMidaoServicePublicationVersionForTest,
  __setMidaoServicePublicationClockForTest,
} = gateway;
const { __setSupabaseClientForTest } = await import('../../src/lib/supabase-env.mjs');
const { createGuideSessionCookies } = await import('../../src/lib/guide-auth.ts');

let publishRoute = {};
let routeImportError = null;
try {
  publishRoute = await import(
    '../../app/api/v2/guide/service-drafts/[draftId]/commands/publish/route.ts'
  );
} catch (error) {
  routeImportError = error;
}

const originalEnv = {
  MIDAO_BACKEND_ENABLED: process.env.MIDAO_BACKEND_ENABLED,
  MIDAO_BACKEND_MUTATIONS_ENABLED: process.env.MIDAO_BACKEND_MUTATIONS_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
};

function completePayload(overrides = {}) {
  return {
    name: '祕島夜間浮潛體驗',
    descriptions: ['專業教練帶隊，含全套裝備與保險。'],
    plans: [{ name: '標準團', booking_type: 'scheduled' }],
    ...overrides,
  };
}

function resetInMemory() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://midao.example';
  __setSupabaseClientForTest(null);
  __resetMidaoServicePublicationStoreForTest();
  __setMidaoServicePublicationClockForTest(FIXED_NOW);
}

test.afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  __setSupabaseClientForTest(null);
  __resetMidaoServicePublicationStoreForTest();
  __setMidaoServicePublicationClockForTest(null);
});

// ---------------------------------------------------------------------------
// 1) Gateway — in-memory parity。
// ---------------------------------------------------------------------------
test('gateway: 正常發布成功 → 草稿清除、版本 1、回 publicUrl', async () => {
  resetInMemory();
  __seedMidaoServicePublicationActivityForTest({
    activityId: ACTIVITY_ID,
    slug: 'night-snorkel',
    regionSlug: 'penghu',
  });
  __seedMidaoServicePublicationDraftForTest({
    activityId: ACTIVITY_ID,
    guideId: GUIDE_ID,
    revision: 3,
    payload: completePayload(),
  });

  const result = await publishServiceDraft(ACTIVITY_ID, 3, GUIDE_ID);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.code, 'PUBLISHED');
  assert.equal(result.idempotent, false);
  assert.equal(result.version, 1);
  assert.equal(result.publicUrl, 'https://midao.example/activities/penghu/night-snorkel');

  // 草稿已被清除：再次以同 revision 發布 → idempotent no-op（版本不再遞增）。
  const replay = await publishServiceDraft(ACTIVITY_ID, 3, GUIDE_ID);
  assert.equal(replay.ok, true);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.code, 'IDEMPOTENT_NO_OP');
  assert.equal(replay.version, 1, 'idempotent replay 不得重複遞增版本');
});

test('gateway: REVISION_CONFLICT（expectedRevision 落後）→ 409，草稿不動', async () => {
  resetInMemory();
  __seedMidaoServicePublicationActivityForTest({ activityId: ACTIVITY_ID, slug: 's', regionSlug: 'r' });
  __seedMidaoServicePublicationDraftForTest({
    activityId: ACTIVITY_ID,
    guideId: GUIDE_ID,
    revision: 5,
    payload: completePayload(),
  });
  const result = await publishServiceDraft(ACTIVITY_ID, 2, GUIDE_ID);
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.code, 'REVISION_CONFLICT');
  assert.equal(result.status, 409);
  assert.equal(result.currentRevision, 5);
});

test('gateway: SLUG_COLLISION（草稿內兩個 plan 相同 slug）→ 409', async () => {
  resetInMemory();
  __seedMidaoServicePublicationActivityForTest({ activityId: ACTIVITY_ID, slug: 's', regionSlug: 'r' });
  __seedMidaoServicePublicationDraftForTest({
    activityId: ACTIVITY_ID,
    guideId: GUIDE_ID,
    revision: 1,
    payload: completePayload({
      plans: [
        { name: '標準團', slug: 'standard', booking_type: 'scheduled' },
        { name: '重複團', slug: 'standard', booking_type: 'request' },
      ],
    }),
  });
  const result = await publishServiceDraft(ACTIVITY_ID, 1, GUIDE_ID);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SLUG_COLLISION');
  assert.equal(result.status, 409);
});

test('gateway: VALIDATION_FAILED（草稿不完整）→ 422，帶 errors', async () => {
  resetInMemory();
  __seedMidaoServicePublicationActivityForTest({ activityId: ACTIVITY_ID, slug: 's', regionSlug: 'r' });
  __seedMidaoServicePublicationDraftForTest({
    activityId: ACTIVITY_ID,
    guideId: GUIDE_ID,
    revision: 1,
    payload: { name: '只有名字' }, // 缺說明與方案。
  });
  const result = await publishServiceDraft(ACTIVITY_ID, 1, GUIDE_ID);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'VALIDATION_FAILED');
  assert.equal(result.status, 422);
  assert.ok(Array.isArray(result.errors));
  assert.ok(result.errors.length >= 1);
});

test('gateway: 不完整草稿的 VALIDATION_FAILED 優先於版本衝突', async () => {
  resetInMemory();
  __seedMidaoServicePublicationActivityForTest({ activityId: ACTIVITY_ID, slug: 's', regionSlug: 'r' });
  __seedMidaoServicePublicationDraftForTest({
    activityId: ACTIVITY_ID,
    guideId: GUIDE_ID,
    revision: 5,
    payload: { name: '只有名字' },
  });
  // 即使 expectedRevision 落後，不完整草稿一律先擋 422（不完整草稿無論版本都不該發布）。
  const result = await publishServiceDraft(ACTIVITY_ID, 2, GUIDE_ID);
  assert.equal(result.code, 'VALIDATION_FAILED');
  assert.equal(result.status, 422);
});

test('gateway: Ownership 不符 → OWNERSHIP_MISMATCH（404）', async () => {
  resetInMemory();
  __seedMidaoServicePublicationActivityForTest({ activityId: ACTIVITY_ID, slug: 's', regionSlug: 'r' });
  __seedMidaoServicePublicationDraftForTest({
    activityId: ACTIVITY_ID,
    guideId: GUIDE_ID,
    revision: 1,
    payload: completePayload(),
  });
  const result = await publishServiceDraft(ACTIVITY_ID, 1, OTHER_GUIDE_ID);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OWNERSHIP_MISMATCH');
  assert.equal(result.status, 404);
});

test('gateway: 找不到 active 草稿且從未發布 → DRAFT_NOT_FOUND（404）', async () => {
  resetInMemory();
  __seedMidaoServicePublicationActivityForTest({ activityId: ACTIVITY_ID, slug: 's', regionSlug: 'r' });
  const result = await publishServiceDraft(ACTIVITY_ID, 1, GUIDE_ID);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DRAFT_NOT_FOUND');
  assert.equal(result.status, 404);
});

test('gateway: 找不到 active 草稿但已有發布版本 → idempotent no-op 成功', async () => {
  resetInMemory();
  __seedMidaoServicePublicationActivityForTest({ activityId: ACTIVITY_ID, slug: 'done', regionSlug: 'penghu' });
  __seedMidaoServicePublicationVersionForTest({ activityId: ACTIVITY_ID, version: 2 });
  const result = await publishServiceDraft(ACTIVITY_ID, 3, GUIDE_ID);
  assert.equal(result.ok, true);
  assert.equal(result.idempotent, true);
  assert.equal(result.version, 2);
  assert.equal(result.publicUrl, 'https://midao.example/activities/penghu/done');
});

test('gateway: 輸入驗證 — activityId 非 UUID / guideId 非 UUID / expectedRevision < 1', async () => {
  resetInMemory();
  const bad1 = await publishServiceDraft('not-a-uuid', 1, GUIDE_ID);
  assert.equal(bad1.code, 'INVALID_ACTIVITY_ID');
  assert.equal(bad1.status, 422);
  const bad2 = await publishServiceDraft(ACTIVITY_ID, 1, 'not-a-uuid');
  assert.equal(bad2.code, 'INVALID_GUIDE_ID');
  const bad3 = await publishServiceDraft(ACTIVITY_ID, 0, GUIDE_ID);
  assert.equal(bad3.code, 'INVALID_EXPECTED_REVISION');
  assert.equal(bad3.status, 422);
});

// ---------------------------------------------------------------------------
// 2) Gateway — Supabase parity（呼叫 S6 RPC）。
// ---------------------------------------------------------------------------
function createSupabaseFake({ rpcResult, activityRow } = {}) {
  const calls = [];
  return {
    calls,
    supabase: {
      from(table) {
        calls.push({ type: 'from', table });
        assert.equal(table, 'activities');
        const query = {
          select() { return query; },
          eq() { return query; },
          maybeSingle() {
            return Promise.resolve({ data: activityRow ?? null, error: null });
          },
        };
        return query;
      },
      rpc(fn, args) {
        calls.push({ type: 'rpc', fn, args });
        assert.equal(fn, 'midao_publish_service_draft');
        return Promise.resolve(rpcResult ?? { data: null, error: null });
      },
    },
  };
}

function useSupabase(fake) {
  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://midao.example';
  __setSupabaseClientForTest(fake.supabase);
}

test('gateway parity: Supabase RPC PUBLISHED → 回 version + publicUrl', async () => {
  resetInMemory();
  // 種一份 active 草稿讓預檢（getServiceDraft + S3）通過；draft store 由 S4 gateway 維護，
  // 這裡改由 Supabase fake 供 getServiceDraft 讀取。需要一個同時服務 draft 與 activities 的 fake。
  const fake = {
    supabase: {
      from(table) {
        if (table === 'guide_service_drafts') {
          const q = {
            select() { return q; },
            eq() { return q; },
            maybeSingle() {
              return Promise.resolve({
                data: {
                  id: 'd1',
                  activity_id: ACTIVITY_ID,
                  guide_id: GUIDE_ID,
                  revision: 4,
                  status: 'active',
                  payload: completePayload(),
                  updated_at: FIXED_NOW,
                },
                error: null,
              });
            },
          };
          return q;
        }
        if (table === 'activities') {
          const q = {
            select() { return q; },
            eq() { return q; },
            maybeSingle() {
              return Promise.resolve({ data: { slug: 'rpc-slug', region: null, region_slug: 'taipei' }, error: null });
            },
          };
          return q;
        }
        throw new Error(`unexpected table ${table}`);
      },
      rpc(fn, args) {
        assert.equal(fn, 'midao_publish_service_draft');
        assert.equal(args.p_activity_id, ACTIVITY_ID);
        assert.equal(args.p_expected_revision, 4);
        assert.equal(args.p_guide_id, GUIDE_ID);
        return Promise.resolve({
          data: { published: true, idempotent: false, code: 'PUBLISHED', activityId: ACTIVITY_ID, version: 1 },
          error: null,
        });
      },
    },
  };
  useSupabase(fake);
  const result = await publishServiceDraft(ACTIVITY_ID, 4, GUIDE_ID);
  assert.equal(result.ok, true);
  assert.equal(result.version, 1);
  assert.equal(result.publicUrl, 'https://midao.example/activities/taipei/rpc-slug');
});

test('gateway parity: RPC 回 REVISION_CONFLICT data → 409 帶 currentRevision', async () => {
  resetInMemory();
  const fake = {
    supabase: {
      from(table) {
        const q = {
          select() { return q; },
          eq() { return q; },
          maybeSingle() {
            if (table === 'guide_service_drafts') {
              return Promise.resolve({
                data: {
                  id: 'd1', activity_id: ACTIVITY_ID, guide_id: GUIDE_ID,
                  revision: 9, status: 'active', payload: completePayload(), updated_at: FIXED_NOW,
                },
                error: null,
              });
            }
            return Promise.resolve({ data: { slug: 's', region: null, region_slug: 'r' }, error: null });
          },
        };
        return q;
      },
      rpc() {
        return Promise.resolve({
          data: { published: false, idempotent: false, code: 'REVISION_CONFLICT', activityId: ACTIVITY_ID, currentRevision: 9 },
          error: null,
        });
      },
    },
  };
  useSupabase(fake);
  const result = await publishServiceDraft(ACTIVITY_ID, 3, GUIDE_ID);
  assert.equal(result.conflict, true);
  assert.equal(result.status, 409);
  assert.equal(result.currentRevision, 9);
});

test('gateway parity: RPC error 23505（slug 衝突）→ SLUG_COLLISION 409', async () => {
  resetInMemory();
  const fake = {
    supabase: {
      from(table) {
        const q = {
          select() { return q; },
          eq() { return q; },
          maybeSingle() {
            if (table === 'guide_service_drafts') {
              return Promise.resolve({
                data: {
                  id: 'd1', activity_id: ACTIVITY_ID, guide_id: GUIDE_ID,
                  revision: 1, status: 'active', payload: completePayload(), updated_at: FIXED_NOW,
                },
                error: null,
              });
            }
            return Promise.resolve({ data: { slug: 's', region: null, region_slug: 'r' }, error: null });
          },
        };
        return q;
      },
      rpc() {
        return Promise.resolve({ data: null, error: { code: '23505', message: 'unique_violation activity_plans_slug' } });
      },
    },
  };
  useSupabase(fake);
  const result = await publishServiceDraft(ACTIVITY_ID, 1, GUIDE_ID);
  assert.equal(result.code, 'SLUG_COLLISION');
  assert.equal(result.status, 409);
});

test('gateway parity: RPC error 42501（權限）→ throw，不得偽裝成業務結果', async () => {
  resetInMemory();
  const fake = {
    supabase: {
      from(table) {
        const q = {
          select() { return q; },
          eq() { return q; },
          maybeSingle() {
            if (table === 'guide_service_drafts') {
              return Promise.resolve({
                data: {
                  id: 'd1', activity_id: ACTIVITY_ID, guide_id: GUIDE_ID,
                  revision: 1, status: 'active', payload: completePayload(), updated_at: FIXED_NOW,
                },
                error: null,
              });
            }
            return Promise.resolve({ data: { slug: 's', region: null, region_slug: 'r' }, error: null });
          },
        };
        return q;
      },
      rpc() {
        return Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied' } });
      },
    },
  };
  useSupabase(fake);
  await assert.rejects(
    () => publishServiceDraft(ACTIVITY_ID, 1, GUIDE_ID),
    (error) => {
      assert.equal(error.name, 'MidaoServicePublicationBackendError');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// 3) Route — HTTP 映射。
//
// route 需要真實的 canonical guide session（guide_profiles runtime 查詢）、ownership
// （activities 查詢）與 gateway Supabase 路徑（getServiceDraft 讀 guide_service_drafts →
// S6 RPC）。因此用一個同時服務四者的有狀態 Supabase fake（比照 S5 midao-service-drafts.test）。
// ---------------------------------------------------------------------------
function cookieHeader(cookies) {
  return cookies.map((c) => c.split(';')[0]).join('; ');
}
function guideCookies(guideId = GUIDE_ID) {
  return cookieHeader(createGuideSessionCookies(guideId, 'Cookie Guide', SESSION_VERSION));
}
function postRequest(activityId, body, { authenticated = true, csrf = 'csrf-value' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (authenticated) {
    headers.cookie = csrf ? `${guideCookies()}; tp_csrf=${csrf}` : guideCookies();
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  return new Request(
    `https://example.test/api/v2/guide/service-drafts/${activityId}/commands/publish`,
    { method: 'POST', headers, body: JSON.stringify(body) },
  );
}
async function readPayload(response) {
  return { status: response.status, body: await response.json() };
}
function callPublish(request, activityId) {
  return publishRoute.POST(request, { params: Promise.resolve({ draftId: activityId }) });
}

// 有狀態 Supabase fake：guide_profiles(single)、activities(single/maybeSingle)、
// guide_service_drafts(select maybeSingle，供 getServiceDraft 抓 active 草稿預檢)、
// rpc(midao_publish_service_draft)。rpc handler 由各測試注入，模擬 S6 RPC 的回應。
function createRouteSupabaseFake({
  draft = null,
  activityGuideId = GUIDE_ID,
  activityRow = { slug: 'ok', region: null, region_slug: 'penghu' },
  rpc,
} = {}) {
  const client = {
    from(table) {
      if (table === 'guide_profiles') {
        const q = {
          select() { return q; },
          eq() { return q; },
          async single() {
            return {
              data: {
                id: GUIDE_ID,
                display_name: 'Canonical Guide',
                backend_mode: 'midao',
                guide_session_version: SESSION_VERSION,
                verification_status: 'approved',
              },
              error: null,
            };
          },
        };
        return q;
      }
      if (table === 'activities') {
        const q = {
          _id: null,
          select() { return q; },
          eq(field, value) { if (field === 'id') q._id = value; return q; },
          async single() {
            if (q._id !== ACTIVITY_ID) return { data: null, error: { message: 'not found' } };
            return { data: { id: ACTIVITY_ID, guide_id: activityGuideId }, error: null };
          },
          async maybeSingle() {
            return { data: activityRow, error: null };
          },
        };
        return q;
      }
      if (table === 'guide_service_drafts') {
        const q = {
          select() { return q; },
          eq() { return q; },
          async maybeSingle() {
            return { data: draft, error: null };
          },
        };
        return q;
      }
      throw new Error(`unexpected table: ${table}`);
    },
    async rpc(fn, args) {
      assert.equal(fn, 'midao_publish_service_draft');
      if (typeof rpc === 'function') return rpc(args);
      return { data: null, error: null };
    },
  };
  return { client };
}

function installRouteEnv(fake) {
  process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;
  process.env.MIDAO_BACKEND_ENABLED = '1';
  process.env.MIDAO_BACKEND_MUTATIONS_ENABLED = '1';
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://midao.example';
  __setSupabaseClientForTest(fake ? fake.client : null);
  __resetMidaoServicePublicationStoreForTest();
  __setMidaoServicePublicationClockForTest(FIXED_NOW);
}

function draftRow(overrides = {}) {
  return {
    id: 'd1',
    activity_id: ACTIVITY_ID,
    guide_id: GUIDE_ID,
    revision: 2,
    status: 'active',
    payload: completePayload(),
    updated_at: FIXED_NOW,
    ...overrides,
  };
}

test('route imports cleanly and exports POST', () => {
  assert.equal(routeImportError, null, routeImportError ? String(routeImportError && routeImportError.stack) : 'import ok');
  assert.equal(typeof publishRoute.POST, 'function');
});

test('route: 發布成功 → 200，body 帶 publicUrl / version', async () => {
  const fake = createRouteSupabaseFake({
    draft: draftRow({ revision: 2 }),
    rpc: (args) => {
      assert.equal(args.p_expected_revision, 2);
      return { data: { published: true, idempotent: false, code: 'PUBLISHED', activityId: ACTIVITY_ID, version: 1 }, error: null };
    },
  });
  installRouteEnv(fake);
  const { status, body } = await readPayload(await callPublish(postRequest(ACTIVITY_ID, { expectedRevision: 2 }), ACTIVITY_ID));
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.published, true);
  assert.equal(body.data.version, 1);
  assert.equal(body.data.publicUrl, 'https://midao.example/activities/penghu/ok');
});

test('route: REVISION_CONFLICT → 409 帶 currentRevision', async () => {
  const fake = createRouteSupabaseFake({
    draft: draftRow({ revision: 5 }),
    rpc: () => ({ data: { published: false, idempotent: false, code: 'REVISION_CONFLICT', activityId: ACTIVITY_ID, currentRevision: 5 }, error: null }),
  });
  installRouteEnv(fake);
  const { status, body } = await readPayload(await callPublish(postRequest(ACTIVITY_ID, { expectedRevision: 2 }), ACTIVITY_ID));
  assert.equal(status, 409);
  assert.equal(body.error.code, 'REVISION_CONFLICT');
  assert.equal(body.currentRevision, 5);
});

test('route: SLUG_COLLISION → 409（草稿內重複 slug，預檢即擋，不進 RPC）', async () => {
  let rpcCalled = false;
  const fake = createRouteSupabaseFake({
    draft: draftRow({
      revision: 1,
      payload: completePayload({
        plans: [
          { name: 'A', slug: 'dup', booking_type: 'scheduled' },
          { name: 'B', slug: 'dup', booking_type: 'request' },
        ],
      }),
    }),
    rpc: () => { rpcCalled = true; return { data: null, error: null }; },
  });
  installRouteEnv(fake);
  const { status, body } = await readPayload(await callPublish(postRequest(ACTIVITY_ID, { expectedRevision: 1 }), ACTIVITY_ID));
  assert.equal(status, 409);
  assert.equal(body.error.code, 'SLUG_COLLISION');
  assert.equal(rpcCalled, false, '重複 slug 應在應用層預檢擋下，不打 RPC');
});

test('route: SLUG_COLLISION → 409（RPC 回 23505）', async () => {
  const fake = createRouteSupabaseFake({
    draft: draftRow({ revision: 1 }),
    rpc: () => ({ data: null, error: { code: '23505', message: 'unique_violation activity_plans_slug' } }),
  });
  installRouteEnv(fake);
  const { status, body } = await readPayload(await callPublish(postRequest(ACTIVITY_ID, { expectedRevision: 1 }), ACTIVITY_ID));
  assert.equal(status, 409);
  assert.equal(body.error.code, 'SLUG_COLLISION');
});

test('route: VALIDATION_FAILED → 422 帶 errors[]', async () => {
  let rpcCalled = false;
  const fake = createRouteSupabaseFake({
    draft: draftRow({ revision: 1, payload: { name: '只有名字' } }),
    rpc: () => { rpcCalled = true; return { data: null, error: null }; },
  });
  installRouteEnv(fake);
  const { status, body } = await readPayload(await callPublish(postRequest(ACTIVITY_ID, { expectedRevision: 1 }), ACTIVITY_ID));
  assert.equal(status, 422);
  assert.equal(body.error.code, 'VALIDATION_FAILED');
  assert.ok(Array.isArray(body.errors));
  assert.ok(body.errors.length >= 1);
  assert.equal(rpcCalled, false, '不完整草稿應在應用層預檢擋下，不打 RPC');
});

test('route: 找不到草稿 → 404', async () => {
  const fake = createRouteSupabaseFake({
    draft: null,
    rpc: () => ({ data: { published: false, idempotent: false, code: 'DRAFT_NOT_FOUND', activityId: ACTIVITY_ID }, error: null }),
  });
  installRouteEnv(fake);
  const { status, body } = await readPayload(await callPublish(postRequest(ACTIVITY_ID, { expectedRevision: 1 }), ACTIVITY_ID));
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('route: 另一位 guide 的活動 → 404（ownership 收斂）', async () => {
  const fake = createRouteSupabaseFake({ draft: draftRow(), activityGuideId: OTHER_GUIDE_ID });
  installRouteEnv(fake);
  const { status, body } = await readPayload(await callPublish(postRequest(ACTIVITY_ID, { expectedRevision: 2 }), ACTIVITY_ID));
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('route: 非 UUID draftId → 404', async () => {
  const fake = createRouteSupabaseFake({ draft: draftRow() });
  installRouteEnv(fake);
  const { status, body } = await readPayload(await callPublish(postRequest('not-a-uuid', { expectedRevision: 1 }), 'not-a-uuid'));
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('route: 缺 auth → 401', async () => {
  const fake = createRouteSupabaseFake({ draft: draftRow() });
  installRouteEnv(fake);
  const { status, body } = await readPayload(
    await callPublish(postRequest(ACTIVITY_ID, { expectedRevision: 1 }, { authenticated: false }), ACTIVITY_ID),
  );
  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('route: 缺 CSRF → 403', async () => {
  const fake = createRouteSupabaseFake({ draft: draftRow() });
  installRouteEnv(fake);
  const { status, body } = await readPayload(
    await callPublish(postRequest(ACTIVITY_ID, { expectedRevision: 1 }, { csrf: '' }), ACTIVITY_ID),
  );
  assert.equal(status, 403);
  assert.ok(/CSRF/u.test(body.error.code));
});

test('route: mutations flag 關 → 503', async () => {
  const fake = createRouteSupabaseFake({ draft: draftRow() });
  installRouteEnv(fake);
  process.env.MIDAO_BACKEND_MUTATIONS_ENABLED = '0';
  const { status, body } = await readPayload(await callPublish(postRequest(ACTIVITY_ID, { expectedRevision: 1 }), ACTIVITY_ID));
  assert.equal(status, 503);
  assert.equal(body.error.code, 'MUTATIONS_DISABLED');
});
