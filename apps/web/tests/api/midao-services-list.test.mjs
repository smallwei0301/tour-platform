import assert from 'node:assert/strict';
import test from 'node:test';

// #1758 S8 · Task 29 — guide 服務清單 API（min/max price、draft/published、分頁）測試（TDD RED → GREEN）。
//
// 覆蓋（依 Pandora S8 spec）：
//   Resolver（in-memory parity）
//     - 正常分頁清單（含 min/max 價格計算正確）。
//     - 顯示狀態：published / draft / 兩者皆有時 draft 優先且標記 hasUnpublishedChanges。
//     - status 篩選（all / draft / published）。
//     - 空清單情境。
//     - 非本人資料不外洩（清單只回自己名下的服務）。
//     - 分頁邊界（page/pageSize、total/totalPages）。
//     - 沒有任何有效方案 → min/max = null。
//     - 查詢參數驗證（pageSize 超上限 / page < 1 / status 非法）。
//   Resolver（Supabase parity）
//     - 走 Supabase 讀 activities + activity_plans + drafts + versions，結果與 in-memory 一致。
//   Route（HTTP 映射）
//     - 成功 200，body.data 帶分頁清單。
//     - 查詢參數不合法 → 422。
//     - 缺 auth → 401。

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVITY_A = '11111111-1111-4111-8111-111111111111';
const ACTIVITY_B = '22222222-2222-4222-8222-222222222222';
const ACTIVITY_C = '33333333-3333-4333-8333-333333333333';
const ACTIVITY_D = '44444444-4444-4444-8444-444444444444';
const NATIVE_FALLBACK_ACTIVITY_IDS = [
  'c0000003-0000-0000-0000-000000000001',
  'c0000003-0000-0000-0000-000000000002',
  'c0000003-0000-0000-0000-000000000003',
];
const GUIDE_SESSION_SECRET = 'task29-services-list-test-guide-session-secret-0123456789';
const SESSION_VERSION = 7;

process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;

const resolverModule = await import('../../src/lib/midao/service-list-resolver.ts');
const {
  resolveGuideServiceList,
  __resetMidaoServiceListStoreForTest,
  __seedMidaoServiceListActivityForTest,
  __seedMidaoServiceListPlanForTest,
  __seedMidaoServiceListDraftForTest,
  __seedMidaoServiceListVersionForTest,
  __internal,
} = resolverModule;

const { __setSupabaseClientForTest } = await import('../../src/lib/supabase-env.mjs');
const { createGuideSessionCookies } = await import('../../src/lib/guide-auth.ts');

let servicesRoute = {};
let routeImportError = null;
try {
  servicesRoute = await import('../../app/api/v2/guide/services/route.ts');
} catch (error) {
  routeImportError = error;
}

const originalEnv = {
  MIDAO_BACKEND_ENABLED: process.env.MIDAO_BACKEND_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function resetInMemory() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  __resetMidaoServiceListStoreForTest();
}

test.afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  __setSupabaseClientForTest(null);
  __resetMidaoServiceListStoreForTest();
});

// ---------------------------------------------------------------------------
// 1) Resolver — in-memory parity。
// ---------------------------------------------------------------------------
test('resolver: 正常清單，min/max 價格計算正確', async () => {
  resetInMemory();
  __seedMidaoServiceListActivityForTest({
    activityId: ACTIVITY_A, guideId: GUIDE_ID, title: '夜間浮潛', slug: 'night-snorkel',
    updatedAt: '2026-08-01T10:00:00.000Z',
  });
  __seedMidaoServiceListPlanForTest({ activityId: ACTIVITY_A, basePrice: 1800 });
  __seedMidaoServiceListPlanForTest({ activityId: ACTIVITY_A, basePrice: 3200 });
  __seedMidaoServiceListPlanForTest({ activityId: ACTIVITY_A, basePrice: 2500 });
  __seedMidaoServiceListVersionForTest({ activityId: ACTIVITY_A, version: 1 });

  const result = await resolveGuideServiceList(GUIDE_ID, {});
  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.activityId, ACTIVITY_A);
  assert.equal(item.title, '夜間浮潛');
  assert.equal(item.slug, 'night-snorkel');
  assert.equal(item.status, 'published');
  assert.equal(item.hasUnpublishedChanges, false);
  assert.equal(item.minPrice, 1800);
  assert.equal(item.maxPrice, 3200);
  assert.equal(item.publishedVersion, 1);
});

test('resolver: 顯示狀態 — draft / published / 兩者皆有以 draft 優先並標記 hasUnpublishedChanges', async () => {
  resetInMemory();
  // A：只有 draft。
  __seedMidaoServiceListActivityForTest({ activityId: ACTIVITY_A, guideId: GUIDE_ID, title: 'A', updatedAt: '2026-08-01T03:00:00.000Z' });
  __seedMidaoServiceListDraftForTest({ activityId: ACTIVITY_A, revision: 2 });
  // B：只有 published。
  __seedMidaoServiceListActivityForTest({ activityId: ACTIVITY_B, guideId: GUIDE_ID, title: 'B', updatedAt: '2026-08-01T02:00:00.000Z' });
  __seedMidaoServiceListVersionForTest({ activityId: ACTIVITY_B, version: 3 });
  // C：兩者皆有。
  __seedMidaoServiceListActivityForTest({ activityId: ACTIVITY_C, guideId: GUIDE_ID, title: 'C', updatedAt: '2026-08-01T01:00:00.000Z' });
  __seedMidaoServiceListDraftForTest({ activityId: ACTIVITY_C, revision: 5 });
  __seedMidaoServiceListVersionForTest({ activityId: ACTIVITY_C, version: 1 });
  // D：皆無 → 不列入。
  __seedMidaoServiceListActivityForTest({ activityId: ACTIVITY_D, guideId: GUIDE_ID, title: 'D', updatedAt: '2026-08-01T00:00:00.000Z' });

  const result = await resolveGuideServiceList(GUIDE_ID, {});
  assert.equal(result.total, 3, 'D 皆無草稿/版本 → 不列入清單');
  const byId = Object.fromEntries(result.items.map((i) => [i.activityId, i]));

  assert.equal(byId[ACTIVITY_A].status, 'draft');
  assert.equal(byId[ACTIVITY_A].hasUnpublishedChanges, false);
  assert.equal(byId[ACTIVITY_A].draftRevision, 2);
  assert.equal(byId[ACTIVITY_A].publishedVersion, null);

  assert.equal(byId[ACTIVITY_B].status, 'published');
  assert.equal(byId[ACTIVITY_B].hasUnpublishedChanges, false);

  assert.equal(byId[ACTIVITY_C].status, 'draft', '兩者皆有時以 draft 優先顯示');
  assert.equal(byId[ACTIVITY_C].hasUnpublishedChanges, true);
  assert.equal(byId[ACTIVITY_C].draftRevision, 5);
  assert.equal(byId[ACTIVITY_C].publishedVersion, 1);

  assert.equal(byId[ACTIVITY_D], undefined);
});

test('resolver: status 篩選（draft / published / all）', async () => {
  resetInMemory();
  __seedMidaoServiceListActivityForTest({ activityId: ACTIVITY_A, guideId: GUIDE_ID, updatedAt: '2026-08-01T03:00:00.000Z' });
  __seedMidaoServiceListDraftForTest({ activityId: ACTIVITY_A, revision: 1 });
  __seedMidaoServiceListActivityForTest({ activityId: ACTIVITY_B, guideId: GUIDE_ID, updatedAt: '2026-08-01T02:00:00.000Z' });
  __seedMidaoServiceListVersionForTest({ activityId: ACTIVITY_B, version: 1 });
  // C 兩者皆有 → 顯示狀態為 draft，故 published 篩選不含 C。
  __seedMidaoServiceListActivityForTest({ activityId: ACTIVITY_C, guideId: GUIDE_ID, updatedAt: '2026-08-01T01:00:00.000Z' });
  __seedMidaoServiceListDraftForTest({ activityId: ACTIVITY_C, revision: 1 });
  __seedMidaoServiceListVersionForTest({ activityId: ACTIVITY_C, version: 1 });

  const all = await resolveGuideServiceList(GUIDE_ID, { status: 'all' });
  assert.equal(all.total, 3);

  const drafts = await resolveGuideServiceList(GUIDE_ID, { status: 'draft' });
  assert.deepEqual(drafts.items.map((i) => i.activityId).sort(), [ACTIVITY_A, ACTIVITY_C].sort());

  const published = await resolveGuideServiceList(GUIDE_ID, { status: 'published' });
  assert.deepEqual(published.items.map((i) => i.activityId), [ACTIVITY_B]);
});

test('resolver: 空清單情境 → total 0、items 空、totalPages 0', async () => {
  resetInMemory();
  const result = await resolveGuideServiceList(GUIDE_ID, {});
  assert.equal(result.total, 0);
  assert.equal(result.items.length, 0);
  assert.equal(result.totalPages, 0);
  assert.equal(result.page, 1);
});

test('resolver: 非本人資料不外洩（只回自己名下服務）', async () => {
  resetInMemory();
  __seedMidaoServiceListActivityForTest({ activityId: ACTIVITY_A, guideId: GUIDE_ID, updatedAt: '2026-08-01T03:00:00.000Z' });
  __seedMidaoServiceListVersionForTest({ activityId: ACTIVITY_A, version: 1 });
  __seedMidaoServiceListActivityForTest({ activityId: ACTIVITY_B, guideId: OTHER_GUIDE_ID, updatedAt: '2026-08-01T02:00:00.000Z' });
  __seedMidaoServiceListVersionForTest({ activityId: ACTIVITY_B, version: 1 });

  const result = await resolveGuideServiceList(GUIDE_ID, {});
  assert.equal(result.total, 1);
  assert.equal(result.items[0].activityId, ACTIVITY_A);
});

test('resolver: 分頁邊界（page / pageSize / total / totalPages）', async () => {
  resetInMemory();
  const ids = [ACTIVITY_A, ACTIVITY_B, ACTIVITY_C, ACTIVITY_D, '55555555-5555-4555-8555-555555555555'];
  ids.forEach((id, index) => {
    __seedMidaoServiceListActivityForTest({
      activityId: id, guideId: GUIDE_ID,
      // updatedAt 遞減，確保穩定分頁順序。
      updatedAt: `2026-08-0${index + 1}T00:00:00.000Z`,
    });
    __seedMidaoServiceListVersionForTest({ activityId: id, version: 1 });
  });

  const page1 = await resolveGuideServiceList(GUIDE_ID, { page: 1, pageSize: 2 });
  assert.equal(page1.total, 5);
  assert.equal(page1.totalPages, 3);
  assert.equal(page1.items.length, 2);

  const page3 = await resolveGuideServiceList(GUIDE_ID, { page: 3, pageSize: 2 });
  assert.equal(page3.items.length, 1);

  // 頁碼越界 → 空清單但 total 不變。
  const page4 = await resolveGuideServiceList(GUIDE_ID, { page: 4, pageSize: 2 });
  assert.equal(page4.items.length, 0);
  assert.equal(page4.total, 5);

  // 分頁不重複、覆蓋所有 id。
  const collected = [
    ...page1.items,
    ...(await resolveGuideServiceList(GUIDE_ID, { page: 2, pageSize: 2 })).items,
    ...page3.items,
  ].map((i) => i.activityId);
  assert.deepEqual(collected.sort(), ids.slice().sort());
});

test('resolver: 沒有任何有效方案 → min/max = null', async () => {
  resetInMemory();
  __seedMidaoServiceListActivityForTest({ activityId: ACTIVITY_A, guideId: GUIDE_ID, updatedAt: '2026-08-01T03:00:00.000Z' });
  __seedMidaoServiceListVersionForTest({ activityId: ACTIVITY_A, version: 1 });

  const result = await resolveGuideServiceList(GUIDE_ID, {});
  assert.equal(result.items[0].minPrice, null);
  assert.equal(result.items[0].maxPrice, null);
});

test('resolver: 查詢參數驗證（pageSize 超上限 / page < 1 / status 非法 / guideId 非 UUID）', async () => {
  resetInMemory();
  await assert.rejects(() => resolveGuideServiceList(GUIDE_ID, { pageSize: 999 }), (e) => e.code === 'INVALID_REQUEST_QUERY');
  await assert.rejects(() => resolveGuideServiceList(GUIDE_ID, { page: 0 }), (e) => e.code === 'INVALID_REQUEST_QUERY');
  await assert.rejects(() => resolveGuideServiceList(GUIDE_ID, { status: 'bogus' }), (e) => e.code === 'INVALID_REQUEST_QUERY');
  await assert.rejects(() => resolveGuideServiceList('not-a-uuid', {}), (e) => e.code === 'INVALID_REQUEST_QUERY');
});

// ---------------------------------------------------------------------------
// 2) Resolver — Supabase parity。
// ---------------------------------------------------------------------------
function createSupabaseFake({
  activities = [],
  plans = [],
  drafts = [],
  versions = [],
} = {}) {
  return {
    from(table) {
      const state = { rows: [] };
      if (table === 'activities') state.rows = activities;
      else if (table === 'activity_plans') state.rows = plans;
      else if (table === 'guide_service_drafts') state.rows = drafts;
      else if (table === 'service_publication_versions') state.rows = versions;
      else throw new Error(`unexpected table ${table}`);
      const query = {
        _rows: state.rows,
        select() { return query; },
        eq(field, value) {
          query._rows = query._rows.filter((row) => row[field] === value);
          return query;
        },
        in(field, values) {
          const set = new Set(values);
          query._rows = query._rows.filter((row) => set.has(row[field]));
          return query;
        },
        then(resolve) {
          return Promise.resolve({ data: query._rows, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}

function useSupabase(fake) {
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(fake);
}

test('resolver parity: Supabase 路徑與 in-memory 一致（狀態、min/max、篩選）', async () => {
  resetInMemory();
  const fake = createSupabaseFake({
    activities: [
      { id: ACTIVITY_A, guide_id: GUIDE_ID, title: 'A', slug: 'a', updated_at: '2026-08-01T03:00:00.000Z' },
      { id: ACTIVITY_B, guide_id: GUIDE_ID, title: 'B', slug: 'b', updated_at: '2026-08-01T02:00:00.000Z' },
      { id: ACTIVITY_C, guide_id: GUIDE_ID, title: 'C', slug: 'c', updated_at: '2026-08-01T01:00:00.000Z' },
    ],
    plans: [
      { activity_id: ACTIVITY_A, base_price: 1000 },
      { activity_id: ACTIVITY_A, base_price: 4000 },
      { activity_id: ACTIVITY_B, base_price: 2500 },
    ],
    drafts: [
      { activity_id: ACTIVITY_A, revision: 2, status: 'active' },
      { activity_id: ACTIVITY_C, revision: 1, status: 'active' },
    ],
    versions: [
      { activity_id: ACTIVITY_B, version: 1 },
      { activity_id: ACTIVITY_C, version: 3 },
    ],
  });
  useSupabase(fake);

  const result = await resolveGuideServiceList(GUIDE_ID, { status: 'all' });
  assert.equal(result.total, 3);
  const byId = Object.fromEntries(result.items.map((i) => [i.activityId, i]));
  assert.equal(byId[ACTIVITY_A].status, 'draft');
  assert.equal(byId[ACTIVITY_A].minPrice, 1000);
  assert.equal(byId[ACTIVITY_A].maxPrice, 4000);
  assert.equal(byId[ACTIVITY_B].status, 'published');
  assert.equal(byId[ACTIVITY_B].minPrice, 2500);
  assert.equal(byId[ACTIVITY_C].status, 'draft');
  assert.equal(byId[ACTIVITY_C].hasUnpublishedChanges, true);

  const publishedOnly = await resolveGuideServiceList(GUIDE_ID, { status: 'published' });
  assert.deepEqual(publishedOnly.items.map((i) => i.activityId), [ACTIVITY_B]);
});

test('resolver parity: #1825 已知 native published activities 無 draft/version 時以零 RPC fallback 顯示', async () => {
  resetInMemory();
  assert.equal(__internal.normalizeUuid(NATIVE_FALLBACK_ACTIVITY_IDS[0]), NATIVE_FALLBACK_ACTIVITY_IDS[0]);
  for (const invalidUuid of [
    'c0000003-0000-0000-0000-00000000000g',
    `${NATIVE_FALLBACK_ACTIVITY_IDS[0]}-suffix`,
    'not-a-uuid',
  ]) {
    assert.equal(__internal.normalizeUuid(invalidUuid), null);
  }
  const nativePrices = [[1800, 3200], [2400, 4100], [900, 1500]];
  const fake = createSupabaseFake({
    activities: [
      ...NATIVE_FALLBACK_ACTIVITY_IDS.map((id, index) => ({
        id,
        guide_id: GUIDE_ID,
        title: `native-${index + 1}`,
        slug: `native-${index + 1}`,
        status: 'published',
        updated_at: `2026-08-0${index + 1}T00:00:00.000Z`,
      })),
      {
        id: 'c0000003-0000-0000-0000-000000000004',
        guide_id: GUIDE_ID,
        title: 'not allowlisted',
        slug: 'not-allowlisted',
        status: 'published',
        updated_at: '2026-08-04T00:00:00.000Z',
      },
    ],
    plans: NATIVE_FALLBACK_ACTIVITY_IDS.flatMap((activity_id, index) => nativePrices[index].map((base_price) => ({ activity_id, base_price }))),
  });
  useSupabase(fake);

  const disabledResult = await resolveGuideServiceList(GUIDE_ID, { status: 'published' }, {
    materializationEnabled: false,
  });
  assert.equal(disabledResult.total, 3);
  assert.deepEqual(disabledResult.items.map((item) => item.activityId).sort(), NATIVE_FALLBACK_ACTIVITY_IDS.slice().sort());

  const materializationCalls = [];
  const result = await resolveGuideServiceList(GUIDE_ID, { status: 'published' }, {
    materializationEnabled: true,
    ensureLegacyDraftMaterialized: async (...args) => {
      materializationCalls.push(args);
      return { ok: true, revision: 1 };
    },
  });

  assert.equal(result.total, 3);
  assert.deepEqual(result.items.map((item) => item.activityId).sort(), NATIVE_FALLBACK_ACTIVITY_IDS.slice().sort());
  assert.deepEqual(
    materializationCalls.filter(([activityId]) => NATIVE_FALLBACK_ACTIVITY_IDS.includes(activityId)),
    [],
    '白名單 native fallback 不得呼叫 legacy materializer',
  );
  assert.deepEqual(
    materializationCalls,
    [['c0000003-0000-0000-0000-000000000004', GUIDE_ID]],
    '白名單外 activity 維持既有 materialization 行為',
  );
  for (const [index, activityId] of NATIVE_FALLBACK_ACTIVITY_IDS.entries()) {
    const item = result.items.find((candidate) => candidate.activityId === activityId);
    assert.ok(item);
    assert.equal(item.status, 'published');
    assert.equal(item.hasUnpublishedChanges, false);
    assert.equal(item.publishedVersion, null);
    assert.equal(item.minPrice, nativePrices[index][0]);
    assert.equal(item.maxPrice, nativePrices[index][1]);
  }
});

test('resolver parity: Supabase 無活動 → 空清單', async () => {
  resetInMemory();
  useSupabase(createSupabaseFake({ activities: [] }));
  const result = await resolveGuideServiceList(GUIDE_ID, {});
  assert.equal(result.total, 0);
  assert.equal(result.items.length, 0);
});

// ---------------------------------------------------------------------------
// 3) Route — HTTP 映射。
// ---------------------------------------------------------------------------
function cookieHeader(cookies) {
  return cookies.map((c) => c.split(';')[0]).join('; ');
}
function guideCookies(guideId = GUIDE_ID) {
  return cookieHeader(createGuideSessionCookies(guideId, 'Cookie Guide', SESSION_VERSION));
}
function getRequest(query = '', { authenticated = true } = {}) {
  const headers = {};
  if (authenticated) headers.cookie = guideCookies();
  return new Request(`https://example.test/api/v2/guide/services${query}`, { headers });
}
async function readPayload(response) {
  return { status: response.status, body: await response.json() };
}

// 有狀態 Supabase fake：guide_profiles(single) 供 canonical session；其餘表供 resolver。
function createRouteSupabaseFake({
  activities = [],
  plans = [],
  drafts = [],
  versions = [],
  runtimeGuideId = GUIDE_ID,
} = {}) {
  return {
    from(table) {
      if (table === 'guide_profiles') {
        const q = {
          select() { return q; },
          eq() { return q; },
          async single() {
            return {
              data: {
                id: runtimeGuideId,
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
      const dataset =
        table === 'activities' ? activities
          : table === 'activity_plans' ? plans
            : table === 'guide_service_drafts' ? drafts
              : table === 'service_publication_versions' ? versions
                : null;
      if (dataset === null) throw new Error(`unexpected table ${table}`);
      const q = {
        _rows: dataset,
        select() { return q; },
        eq(field, value) { q._rows = q._rows.filter((row) => row[field] === value); return q; },
        in(field, values) { const set = new Set(values); q._rows = q._rows.filter((row) => set.has(row[field])); return q; },
        then(resolve) { return Promise.resolve({ data: q._rows, error: null }).then(resolve); },
      };
      return q;
    },
  };
}

function installRouteEnv(fake) {
  process.env.GUIDE_SESSION_SECRET = GUIDE_SESSION_SECRET;
  process.env.MIDAO_BACKEND_ENABLED = '1';
  process.env.SUPABASE_URL = 'http://example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(fake);
  __resetMidaoServiceListStoreForTest();
}

test('route imports cleanly and exports GET', () => {
  assert.equal(routeImportError, null, routeImportError ? String(routeImportError && routeImportError.stack) : 'import ok');
  assert.equal(typeof servicesRoute.GET, 'function');
});

test('route: 成功 200，body.data 帶分頁清單', async () => {
  const fake = createRouteSupabaseFake({
    activities: [
      { id: ACTIVITY_A, guide_id: GUIDE_ID, title: 'A', slug: 'a', updated_at: '2026-08-01T03:00:00.000Z' },
    ],
    plans: [
      { activity_id: ACTIVITY_A, base_price: 1500 },
      { activity_id: ACTIVITY_A, base_price: 2800 },
    ],
    versions: [{ activity_id: ACTIVITY_A, version: 1 }],
  });
  installRouteEnv(fake);
  const { status, body } = await readPayload(await servicesRoute.GET(getRequest('?page=1&pageSize=20&status=all')));
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.total, 1);
  assert.equal(body.data.items[0].activityId, ACTIVITY_A);
  assert.equal(body.data.items[0].minPrice, 1500);
  assert.equal(body.data.items[0].maxPrice, 2800);
  assert.equal(body.data.items[0].status, 'published');
});

test('route: 查詢參數不合法 → 422', async () => {
  installRouteEnv(createRouteSupabaseFake({}));
  const badStatus = await readPayload(await servicesRoute.GET(getRequest('?status=bogus')));
  assert.equal(badStatus.status, 422);
  assert.equal(badStatus.body.error.code, 'INVALID_REQUEST_QUERY');

  const badPage = await readPayload(await servicesRoute.GET(getRequest('?page=0')));
  assert.equal(badPage.status, 422);

  const badPageSize = await readPayload(await servicesRoute.GET(getRequest('?pageSize=999')));
  assert.equal(badPageSize.status, 422);

  const unknownKey = await readPayload(await servicesRoute.GET(getRequest('?bogusKey=1')));
  assert.equal(unknownKey.status, 422);
});

test('route: 缺 auth → 401', async () => {
  installRouteEnv(createRouteSupabaseFake({}));
  const { status, body } = await readPayload(await servicesRoute.GET(getRequest('', { authenticated: false })));
  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});
