import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createGuideSessionCookies } from '../../src/lib/guide-auth.ts';
import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';
import {
  __resetMidaoServicePlansForTest,
  __seedMidaoServicePlanActivityForTest,
  __seedMidaoServicePlanForTest,
  __setMidaoServicePlanClockForTest,
  __listMidaoServicePlanRowsForTest,
} from '../../src/lib/midao/db-midao-service-plans.mjs';
import {
  __resetMidaoAuditEventsForTest,
  __listMidaoAuditEventsForTest,
} from '../../src/lib/midao/db-midao-audit-events.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

const COLLECTION_ROUTE = 'app/api/v2/guide/midao/services/[activityId]/plans/route.ts';
const ITEM_ROUTE = 'app/api/v2/guide/midao/services/[activityId]/plans/[planId]/route.ts';
const COLLECTION_URL = new URL(`../../${COLLECTION_ROUTE}`, import.meta.url);
const ITEM_URL = new URL(`../../${ITEM_ROUTE}`, import.meta.url);

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_PLAN_ID = '33333333-3333-4333-8333-333333333333';
const T0 = '2026-08-20T00:00:00.000Z';
const T1 = '2026-08-20T01:00:00.000Z';

function sessionCookieHeader(guideId = GUIDE_ID) {
  return createGuideSessionCookies(guideId, 'Canonical Guide', 7)
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ');
}

function runtimeSession(guideId = GUIDE_ID) {
  return {
    guideId,
    guideName: 'Canonical Guide',
    sessionVersion: 7,
    backendMode: 'midao',
    actorType: 'guide',
    actorId: guideId,
  };
}

function deps(over = {}) {
  return {
    verifySession: async () => runtimeSession(over.guideId ?? GUIDE_ID),
    ...over,
  };
}

function buildRequest(url, {
  method = 'POST',
  body,
  guideId = GUIDE_ID,
  csrf = 'csrf-value',
  withCsrf = true,
  idempotencyKey = 'plan-key-1',
  withIdempotency = true,
} = {}) {
  const headers = {
    'content-type': 'application/json',
    cookie: `${sessionCookieHeader(guideId)}${withCsrf ? `; tp_csrf=${csrf}` : ''}`,
  };
  if (withCsrf) headers['x-csrf-token'] = csrf;
  if (withIdempotency) headers['idempotency-key'] = idempotencyKey;
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function planPayload(over = {}) {
  return {
    name: '半日祕境方案',
    description: '含接送',
    duration_minutes: 240,
    price_type: 'per_group',
    base_price: 4800,
    min_participants: 2,
    max_participants: 6,
    booking_type: 'request',
    ...over,
  };
}

function seedActivityAndPlans() {
  __seedMidaoServicePlanActivityForTest({ id: ACTIVITY_ID, guide_id: GUIDE_ID });
  __seedMidaoServicePlanForTest({
    id: PLAN_ID, activity_id: ACTIVITY_ID, name: 'A 方案', description: null,
    duration_minutes: 120, price_type: 'per_person', base_price: 1200,
    min_participants: 1, max_participants: 8, booking_type: 'scheduled',
    slug: 'a-plan', status: 'active', updated_at: T0,
  });
  __seedMidaoServicePlanForTest({
    id: OTHER_PLAN_ID, activity_id: ACTIVITY_ID, name: 'B 方案', description: null,
    duration_minutes: 90, price_type: 'per_person', base_price: 800,
    min_participants: 1, max_participants: 4, booking_type: 'request',
    slug: 'b-plan', status: 'inactive', updated_at: T0,
  });
}

async function postPlan(request, overrides = {}) {
  const route = await import(COLLECTION_URL);
  return route.POST(request, { params: Promise.resolve({ activityId: ACTIVITY_ID }) }, deps(overrides));
}

async function patchPlan(request, planId = PLAN_ID, overrides = {}) {
  const route = await import(ITEM_URL);
  return route.PATCH(request, { params: Promise.resolve({ activityId: ACTIVITY_ID, planId }) }, deps(overrides));
}

async function readJson(response) {
  return { status: response.status, body: await response.json() };
}

test.beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.GUIDE_SESSION_SECRET = 'issue1860-test-guide-session-secret-0123456789';
  process.env.MIDAO_BACKEND_ENABLED = '1';
  process.env.MIDAO_BACKEND_MUTATIONS_ENABLED = '1';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  __resetMidaoServicePlansForTest();
  __resetMidaoAuditEventsForTest();
  __setMidaoServicePlanClockForTest(() => T1);
  seedActivityAndPlans();
});

test.afterEach(() => {
  delete process.env.MIDAO_BACKEND_ENABLED;
  delete process.env.MIDAO_BACKEND_MUTATIONS_ENABLED;
  __setSupabaseClientForTest(null);
  __resetMidaoServicePlansForTest();
  __resetMidaoAuditEventsForTest();
  __setMidaoServicePlanClockForTest(null);
});

test('route 骨架：使用 canonical boundary，不得複製 legacy 認證或發明錯誤外殼', async () => {
  const collection = await read(COLLECTION_ROUTE);
  const item = await read(ITEM_ROUTE);
  for (const src of [collection, item]) {
    assert.match(src, /withMidaoGuide(Command|Query)/u);
    assert.doesNotMatch(src, /verifyGuideSession\(/u);
    assert.doesNotMatch(src, /validateCsrf\(/u);
    assert.doesNotMatch(src, /\.rpc\(/u);
    assert.doesNotMatch(src, /review_state|pending_changes|guide_service_drafts/u);
    assert.doesNotMatch(src, /from ['"][^'"]*\/db\.mjs['"]/u);
  }
  assert.match(collection, /export\s+async\s+function\s+GET/u);
  assert.match(collection, /export\s+async\s+function\s+POST/u);
  assert.match(item, /export\s+async\s+function\s+PATCH/u);
});

test('POST：建立一個方案並寫入剛好一筆 create 稽核事件（before={}）', async () => {
  const response = await postPlan(buildRequest('https://example.test/plans', { body: planPayload() }));
  const { status, body } = await readJson(response);
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.appliedToPublicSurface, true);
  assert.equal(body.data.plan.name, '半日祕境方案');

  const rows = __listMidaoServicePlanRowsForTest();
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.id === PLAN_ID).status, 'active');
  assert.equal(rows.find((r) => r.id === OTHER_PLAN_ID).status, 'inactive');

  const events = __listMidaoAuditEventsForTest();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'midao.plan.create');
  assert.equal(events[0].resource_type, 'activity_plan');
  assert.equal(events[0].actor_type, 'guide');
  assert.deepEqual(events[0].metadata.before, {});
  assert.equal(events[0].metadata.expectedUpdatedAt, null);
  assert.match(
    events[0].request_id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
});

test('PATCH：正確 expectedUpdatedAt 回 200、updated_at 前進、稽核 changedFields 精確', async () => {
  const response = await patchPlan(buildRequest('https://example.test/plans/1', {
    method: 'PATCH',
    body: { base_price: 2500, expectedUpdatedAt: T0 },
  }));
  const { status, body } = await readJson(response);
  assert.equal(status, 200);
  assert.equal(body.data.appliedToPublicSurface, true);
  assert.equal(body.data.plan.basePrice, 2500);
  assert.equal(body.data.plan.updatedAt, T1);

  const events = __listMidaoAuditEventsForTest();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'midao.plan.update');
  assert.deepEqual(events[0].metadata.changedFields, ['base_price']);
  assert.deepEqual(events[0].metadata.before, { base_price: 1200 });
  assert.deepEqual(events[0].metadata.after, { base_price: 2500 });
  assert.equal(events[0].metadata.expectedUpdatedAt, T0);
  assert.equal(events[0].metadata.resultUpdatedAt, T1);

  // 方案 B 完全不受影響
  const b = __listMidaoServicePlanRowsForTest().find((r) => r.id === OTHER_PLAN_ID);
  assert.equal(b.status, 'inactive');
  assert.equal(b.base_price, 800);
  assert.equal(b.updated_at, T0);
});

test('PATCH：過期 expectedUpdatedAt 回 409 PLAN_REVISION_CONFLICT，附現況且寫零筆稽核', async () => {
  const response = await patchPlan(buildRequest('https://example.test/plans/1', {
    method: 'PATCH',
    body: { base_price: 2500, expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
  }));
  const { status, body } = await readJson(response);
  assert.equal(status, 409);
  assert.equal(body.error.code, 'PLAN_REVISION_CONFLICT');
  assert.equal(body.currentUpdatedAt, T0);
  assert.equal(body.currentPlan.basePrice, 1200);

  assert.equal(__listMidaoAuditEventsForTest().length, 0);
  assert.equal(__listMidaoServicePlanRowsForTest().find((r) => r.id === PLAN_ID).base_price, 1200);
});

test('PATCH：缺漏或格式錯誤的 expectedUpdatedAt 回 422 INVALID_EXPECTED_UPDATED_AT 且零稽核', async () => {
  for (const body of [{ base_price: 1 }, { base_price: 1, expectedUpdatedAt: 'not-a-time' }, { base_price: 1, expectedUpdatedAt: 123 }]) {
    const response = await patchPlan(buildRequest('https://example.test/plans/1', { method: 'PATCH', body }));
    const parsed = await readJson(response);
    assert.equal(parsed.status, 422);
    assert.equal(parsed.body.error.code, 'INVALID_EXPECTED_UPDATED_AT');
  }
  assert.equal(__listMidaoAuditEventsForTest().length, 0);
});

test('非擁有者：PATCH 與 POST 一律 404 NOT_FOUND，不洩漏存在性', async () => {
  const patched = await readJson(await patchPlan(buildRequest('https://example.test/plans/1', {
    method: 'PATCH', guideId: OTHER_GUIDE_ID, body: { base_price: 5, expectedUpdatedAt: T0 },
  }), PLAN_ID, { guideId: OTHER_GUIDE_ID }));
  assert.equal(patched.status, 404);
  assert.equal(patched.body.error.code, 'NOT_FOUND');
  assert.doesNotMatch(JSON.stringify(patched.body), /base_price|1200/u);

  const posted = await readJson(await postPlan(buildRequest('https://example.test/plans', {
    guideId: OTHER_GUIDE_ID, body: planPayload(),
  }), { guideId: OTHER_GUIDE_ID }));
  assert.equal(posted.status, 404);
  assert.equal(__listMidaoAuditEventsForTest().length, 0);
});

test('缺 CSRF 回 CSRF_REQUIRED/CSRF_INVALID；缺 Idempotency-Key 回 422 INVALID_IDEMPOTENCY_KEY', async () => {
  const noCsrf = await readJson(await postPlan(buildRequest('https://example.test/plans', {
    body: planPayload(), withCsrf: false,
  })));
  assert.equal(noCsrf.status, 403);
  assert.match(noCsrf.body.error.code, /^CSRF_(REQUIRED|INVALID)$/u);

  const noKey = await readJson(await postPlan(buildRequest('https://example.test/plans', {
    body: planPayload(), withIdempotency: false,
  })));
  assert.equal(noKey.status, 422);
  assert.equal(noKey.body.error.code, 'INVALID_IDEMPOTENCY_KEY');

  assert.equal(__listMidaoAuditEventsForTest().length, 0);
});

test('PATCH：單欄更新造成 min>max 回 422 INVALID_PLAN_INPUT，資料不變且零稽核', async () => {
  // seed plan-a：min=1 / max=8。只送 min_participants=9 合併後 9>8 為非法區間。
  const tooHighMin = await readJson(await patchPlan(buildRequest('https://example.test/plans/1', {
    method: 'PATCH', body: { min_participants: 9, expectedUpdatedAt: T0 },
  })));
  assert.equal(tooHighMin.status, 422);
  assert.equal(tooHighMin.body.error.code, 'INVALID_PLAN_INPUT');

  // 只送 max_participants=0 以下界；改以既有 min=1 合併，max 需 >= min
  const tooLowMax = await readJson(await patchPlan(buildRequest('https://example.test/plans/2', {
    method: 'PATCH', body: { max_participants: 3, expectedUpdatedAt: T0 },
  }), OTHER_PLAN_ID));
  assert.equal(tooLowMax.status, 200); // B 方案 min=1，max=3 合法，確認未過度封鎖

  const rowA = __listMidaoServicePlanRowsForTest().find((r) => r.id === PLAN_ID);
  assert.equal(rowA.min_participants, 1);
  assert.equal(rowA.max_participants, 8);
  assert.equal(rowA.updated_at, T0); // A 方案完全未被寫入

  // 422 的那一次不得留下稽核；合法的 200 只會有一筆
  const events = __listMidaoAuditEventsForTest();
  assert.equal(events.length, 1);
  assert.equal(events[0].resource_id, OTHER_PLAN_ID);
});

test('驗證失敗（422）寫零筆稽核事件', async () => {
  const bad = await readJson(await postPlan(buildRequest('https://example.test/plans', {
    body: planPayload({ base_price: -5 }),
  })));
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.code, 'INVALID_PLAN_INPUT');
  assert.equal(__listMidaoAuditEventsForTest().length, 0);
});

test('稽核 metadata 不得含 token／cookie／authorization／原始 Idempotency-Key', async () => {
  await postPlan(buildRequest('https://example.test/plans', {
    body: planPayload(), idempotencyKey: 'super-secret-idem-key',
  }));
  const events = __listMidaoAuditEventsForTest();
  assert.equal(events.length, 1);
  const serialized = JSON.stringify(events[0]);
  assert.doesNotMatch(serialized, /super-secret-idem-key/u);
  assert.doesNotMatch(serialized, /guide_token|tp_csrf|authorization|Bearer/iu);
  assert.match(events[0].metadata.requestHash, /^[0-9a-f]{64}$/u);
});

test('稽核 metadata 過大時 truncated=true 且 before/after 為 null', async () => {
  const response = await patchPlan(buildRequest('https://example.test/plans/1', {
    method: 'PATCH',
    body: { description: 'x'.repeat(8000), expectedUpdatedAt: T0 },
  }));
  assert.equal(response.status, 200);
  const events = __listMidaoAuditEventsForTest();
  assert.equal(events.length, 1);
  assert.equal(events[0].metadata.truncated, true);
  assert.equal(events[0].metadata.before, null);
  assert.equal(events[0].metadata.after, null);
});

test('稽核寫入失敗不得回滾資料，也不得把成功轉成 500（非原子缺口）', async () => {
  const failingRecorder = async () => { throw new Error('audit backend down'); };
  const response = await patchPlan(
    buildRequest('https://example.test/plans/1', {
      method: 'PATCH', body: { base_price: 3300, expectedUpdatedAt: T0 },
    }),
    PLAN_ID,
    { recordAuditEvent: failingRecorder },
  );
  const { status, body } = await readJson(response);
  assert.equal(status, 200);
  assert.equal(body.data.plan.basePrice, 3300);
  assert.equal(__listMidaoServicePlanRowsForTest().find((r) => r.id === PLAN_ID).base_price, 3300);
});

test('GET：列出含 inactive 的所有非封存方案', async () => {
  const route = await import(COLLECTION_URL);
  const response = await route.GET(
    new Request('https://example.test/plans', { headers: { cookie: sessionCookieHeader() } }),
    { params: Promise.resolve({ activityId: ACTIVITY_ID }) },
    deps(),
  );
  const { status, body } = await readJson(response);
  assert.equal(status, 200);
  assert.deepEqual(body.data.plans.map((p) => p.id).sort(), [PLAN_ID, OTHER_PLAN_ID].sort());
  assert.equal(__listMidaoAuditEventsForTest().length, 0);
});
