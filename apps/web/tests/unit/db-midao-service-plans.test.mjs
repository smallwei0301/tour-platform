import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  normalizePlanInput,
  listServicePlansDb,
  createServicePlanDb,
  updateServicePlanDb,
  deactivateServicePlanDb,
  __resetMidaoServicePlansForTest,
  __seedMidaoServicePlanActivityForTest,
  __seedMidaoServicePlanForTest,
  __setMidaoServicePlanClockForTest,
  __listMidaoServicePlanRowsForTest,
} from '../../src/lib/midao/db-midao-service-plans.mjs';
import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GUIDE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const T0 = '2026-08-20T00:00:00.000Z';
const T1 = '2026-08-20T01:00:00.000Z';

function planInput(over = {}) {
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

function seedActivity() {
  __seedMidaoServicePlanActivityForTest({ id: ACTIVITY_ID, guide_id: GUIDE_ID });
}

function seedPlan(over = {}) {
  return __seedMidaoServicePlanForTest({
    id: over.id ?? 'plan-a',
    activity_id: ACTIVITY_ID,
    name: 'A 方案',
    description: null,
    duration_minutes: 120,
    price_type: 'per_person',
    base_price: 1200,
    min_participants: 1,
    max_participants: 8,
    booking_type: 'scheduled',
    slug: 'a-fang-an',
    status: 'active',
    updated_at: T0,
    ...over,
  });
}

test.beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  __resetMidaoServicePlansForTest();
  __setMidaoServicePlanClockForTest(() => T1);
});

test.afterEach(() => {
  __setSupabaseClientForTest(null);
  __resetMidaoServicePlansForTest();
  __setMidaoServicePlanClockForTest(null);
});

test('normalizePlanInput：完整建立通過並只保留白名單八欄語意，忽略 id/slug/審核欄位', () => {
  const result = normalizePlanInput(planInput({
    id: 'client-supplied',
    slug: 'client-slug',
    status: 'active',
    review_state: 'pending',
    pending_changes: { name: 'x' },
    activity_id: 'other',
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.id, undefined);
  assert.equal(result.value.slug, undefined);
  assert.equal(result.value.status, undefined);
  assert.equal(result.value.review_state, undefined);
  assert.equal(result.value.pending_changes, undefined);
  assert.equal(result.value.activity_id, undefined);
  assert.equal(result.value.name, '半日祕境方案');
  assert.equal(result.value.booking_type, 'request');
});

test('normalizePlanInput：伺服端八欄驗證（名稱／時長／計價／價格／人數／預約方式）', () => {
  assert.equal(normalizePlanInput(planInput({ name: '   ' })).ok, false);
  assert.equal(normalizePlanInput(planInput({ duration_minutes: 5 })).ok, false);
  assert.equal(normalizePlanInput(planInput({ price_type: 'per_hour' })).ok, false);
  assert.equal(normalizePlanInput(planInput({ base_price: -1 })).ok, false);
  assert.equal(normalizePlanInput(planInput({ min_participants: 5, max_participants: 2 })).ok, false);
  assert.equal(normalizePlanInput(planInput({ booking_type: 'bogus' })).ok, false);
  assert.equal(normalizePlanInput(planInput({ name: '' })).code, 'INVALID_PLAN_INPUT');
});

test('normalizePlanInput：partial 只驗有給的欄，且不得回填預設', () => {
  const partial = normalizePlanInput({ base_price: 990 }, true);
  assert.equal(partial.ok, true);
  assert.deepEqual(Object.keys(partial.value), ['base_price']);
  assert.equal(normalizePlanInput({ booking_type: 'bogus' }, true).ok, false);
  assert.equal(normalizePlanInput({}, true).ok, false); // 空 patch 無意義
});

test('listServicePlansDb：回傳非封存方案（含 inactive），越權/不存在 = NOT_FOUND', async () => {
  seedActivity();
  seedPlan({ id: 'plan-a', status: 'active' });
  seedPlan({ id: 'plan-b', status: 'inactive', name: 'B 方案' });
  seedPlan({ id: 'plan-c', status: 'archived', name: 'C 方案' });

  const plans = await listServicePlansDb(GUIDE_ID, ACTIVITY_ID);
  assert.deepEqual(plans.map((p) => p.id).sort(), ['plan-a', 'plan-b']);
  assert.equal(plans.find((p) => p.id === 'plan-b').status, 'inactive');

  await assert.rejects(
    () => listServicePlansDb(OTHER_GUIDE_ID, ACTIVITY_ID),
    (err) => err.code === 'NOT_FOUND' && err.status === 404,
  );
  await assert.rejects(
    () => listServicePlansDb(GUIDE_ID, '99999999-9999-4999-8999-999999999999'),
    (err) => err.code === 'NOT_FOUND' && err.status === 404,
  );
});

test('createServicePlanDb：只新增一列、產生 slug、不動既有方案', async () => {
  seedActivity();
  seedPlan({ id: 'plan-a' });
  seedPlan({ id: 'plan-b', status: 'inactive' });

  const created = await createServicePlanDb({
    guideId: GUIDE_ID, activityId: ACTIVITY_ID, input: planInput(),
  });
  assert.equal(created.plan.activityId, ACTIVITY_ID);
  assert.equal(created.plan.status, 'active');
  assert.ok(created.plan.slug && created.plan.slug.length > 0);
  assert.equal(created.plan.updatedAt, T1);

  const rows = __listMidaoServicePlanRowsForTest();
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.id === 'plan-a').status, 'active');
  assert.equal(rows.find((r) => r.id === 'plan-b').status, 'inactive');
  assert.equal(rows.find((r) => r.id === 'plan-a').updated_at, T0); // 未被連動改寫

  await assert.rejects(
    () => createServicePlanDb({ guideId: OTHER_GUIDE_ID, activityId: ACTIVITY_ID, input: planInput() }),
    (err) => err.code === 'NOT_FOUND' && err.status === 404,
  );
});

test('updateServicePlanDb：正確 expectedUpdatedAt 更新單列並推進 updated_at', async () => {
  seedActivity();
  seedPlan({ id: 'plan-a' });
  seedPlan({ id: 'plan-b', name: 'B 方案', status: 'inactive' });

  const result = await updateServicePlanDb({
    guideId: GUIDE_ID,
    activityId: ACTIVITY_ID,
    planId: 'plan-a',
    input: { base_price: 2500 },
    expectedUpdatedAt: T0,
  });
  assert.equal(result.plan.id, 'plan-a');
  assert.equal(result.plan.basePrice, 2500);
  assert.equal(result.plan.updatedAt, T1);
  assert.deepEqual(result.changedFields, ['base_price']);
  assert.deepEqual(result.before, { base_price: 1200 });
  assert.deepEqual(result.after, { base_price: 2500 });

  const rows = __listMidaoServicePlanRowsForTest();
  const b = rows.find((r) => r.id === 'plan-b');
  assert.equal(b.status, 'inactive');
  assert.equal(b.base_price, 1200);
  assert.equal(b.updated_at, T0);
});

test('updateServicePlanDb：過期 expectedUpdatedAt = PLAN_REVISION_CONFLICT 409 且資料不變', async () => {
  seedActivity();
  seedPlan({ id: 'plan-a', updated_at: T1 });

  await assert.rejects(
    () => updateServicePlanDb({
      guideId: GUIDE_ID,
      activityId: ACTIVITY_ID,
      planId: 'plan-a',
      input: { base_price: 999 },
      expectedUpdatedAt: T0,
    }),
    (err) => {
      assert.equal(err.code, 'PLAN_REVISION_CONFLICT');
      assert.equal(err.status, 409);
      assert.equal(err.currentUpdatedAt, T1);
      assert.equal(err.currentPlan.basePrice, 1200);
      return true;
    },
  );
  assert.equal(__listMidaoServicePlanRowsForTest()[0].base_price, 1200);
});

test('updateServicePlanDb：越權或不存在皆為 NOT_FOUND 404（不洩漏存在性）', async () => {
  seedActivity();
  seedPlan({ id: 'plan-a' });

  const notFound = (err) => err.code === 'NOT_FOUND' && err.status === 404;
  await assert.rejects(() => updateServicePlanDb({
    guideId: OTHER_GUIDE_ID, activityId: ACTIVITY_ID, planId: 'plan-a',
    input: { base_price: 1 }, expectedUpdatedAt: T0,
  }), notFound);
  await assert.rejects(() => updateServicePlanDb({
    guideId: GUIDE_ID, activityId: ACTIVITY_ID, planId: 'plan-missing',
    input: { base_price: 1 }, expectedUpdatedAt: T0,
  }), notFound);
});

test('deactivateServicePlanDb：只寫 status=inactive，不 DELETE 也不 archived', async () => {
  seedActivity();
  seedPlan({ id: 'plan-a' });
  seedPlan({ id: 'plan-b', name: 'B 方案' });

  const result = await deactivateServicePlanDb({
    guideId: GUIDE_ID, activityId: ACTIVITY_ID, planId: 'plan-a', expectedUpdatedAt: T0,
  });
  assert.equal(result.plan.status, 'inactive');
  assert.deepEqual(result.changedFields, ['status']);

  const rows = __listMidaoServicePlanRowsForTest();
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.id === 'plan-a').status, 'inactive');
  assert.equal(rows.find((r) => r.id === 'plan-b').status, 'active');
  assert.ok(!rows.some((r) => r.status === 'archived'));
});

test('Supabase 模式：更新以 planId + activityId + updated_at 三重條件綁定單列', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

  const calls = [];
  const planRow = {
    id: 'plan-a', activity_id: ACTIVITY_ID, name: 'A 方案', description: null,
    duration_minutes: 120, price_type: 'per_person', base_price: 1200,
    min_participants: 1, max_participants: 8, booking_type: 'scheduled',
    slug: 'a-fang-an', status: 'active', updated_at: T0,
  };
  __setSupabaseClientForTest({
    from(table) {
      const call = { table, op: null, eq: {}, payload: null };
      calls.push(call);
      const q = {
        select() { return q; },
        update(payload) { call.op = 'update'; call.payload = payload; return q; },
        eq(field, value) { call.eq[field] = value; return q; },
        neq() { return q; },
        async maybeSingle() {
          if (table === 'activities') return { data: { id: ACTIVITY_ID }, error: null };
          return { data: { ...planRow, base_price: 2500, updated_at: T1 }, error: null };
        },
        then(resolve) {
          return Promise.resolve({ data: [{ ...planRow, base_price: 2500, updated_at: T1 }], error: null }).then(resolve);
        },
      };
      return q;
    },
  });

  const result = await updateServicePlanDb({
    guideId: GUIDE_ID, activityId: ACTIVITY_ID, planId: 'plan-a',
    input: { base_price: 2500 }, expectedUpdatedAt: T0,
  });
  assert.equal(result.plan.basePrice, 2500);

  const updateCall = calls.find((c) => c.op === 'update');
  assert.ok(updateCall, '必須有一次 update 呼叫');
  assert.equal(updateCall.table, 'activity_plans');
  assert.equal(updateCall.eq.id, 'plan-a');
  assert.equal(updateCall.eq.activity_id, ACTIVITY_ID);
  assert.equal(updateCall.eq.updated_at, T0);
  assert.equal(updateCall.payload.activity_id, undefined);

  const ownership = calls.find((c) => c.table === 'activities');
  assert.ok(ownership, '必須先做 activities.guide_id 歸屬檢查');
  assert.equal(ownership.eq.guide_id, GUIDE_ID);
});

test('結構不變式：領域檔不得使用 .rpc(、不得 import db.mjs、不得對 activity_id 做整批 update', async () => {
  const src = await readFile(path.join(ROOT, 'src/lib/midao/db-midao-service-plans.mjs'), 'utf8');
  assert.doesNotMatch(src, /\.rpc\(/u);
  assert.doesNotMatch(src, /from ['"][^'"]*\/db\.mjs['"]/u);
  assert.doesNotMatch(src, /review_state|pending_changes|guide_service_drafts/u);
  assert.doesNotMatch(src, /\.delete\(/u);
  assert.doesNotMatch(src, /'archived'\s*\}/u);
  // 每個 update 都必須綁定單一 planId：不得出現只以 activity_id 過濾的批次寫入
  const updateBlocks = src.split('.update(').slice(1);
  assert.ok(updateBlocks.length > 0);
  for (const block of updateBlocks) {
    const scope = block.slice(0, 400);
    assert.match(scope, /\.eq\('id',/u, '批次寫入禁止：update 必須綁定單一 plan id');
  }
});
