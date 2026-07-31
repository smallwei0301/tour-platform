import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetMidaoServiceDraftStoreForTest,
  __seedMidaoServiceDraftForTest,
  __setMidaoServiceDraftClockForTest,
  getServiceDraft,
  upsertServiceDraft,
  discardServiceDraft,
} from '../../src/lib/midao/db-midao-service-drafts.mjs';
import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';

// #1758 S4 · Task 25 — guide service draft 樂觀鎖（CAS）gateway 測試。
// 覆蓋：正常存檔成功、revision 不符回 409 衝突、discard 需正確 revision，
//       以及 in-memory / Supabase parity（相同呼叫在兩條路徑行為一致）。

const ACTIVITY_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ACTIVITY_ID = '33333333-3333-4333-8333-333333333334';
const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLOCK = '2026-07-31T12:00:00.000Z';

function validQuestion(overrides = {}) {
  return {
    question_key: 'pickup_location',
    label: '接送地點',
    type: 'short_text',
    options: [],
    required: false,
    sort_order: 0,
    ...overrides,
  };
}

function completePayload(overrides = {}) {
  return {
    name: '祕島夜間浮潛體驗',
    descriptions: ['專業教練帶隊，含全套裝備與保險。'],
    plans: [{ name: '標準團', booking_type: 'scheduled' }],
    ...overrides,
  };
}

test.beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  __resetMidaoServiceDraftStoreForTest();
  __setMidaoServiceDraftClockForTest(CLOCK);
});

test.afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  __resetMidaoServiceDraftStoreForTest();
  __setMidaoServiceDraftClockForTest(null);
});

// ---------------------------------------------------------------------------
// 1) 建立與正常存檔（in-memory）。
// ---------------------------------------------------------------------------
test('無 active 草稿時，expectedRevision=0 建立新草稿 revision=1', async () => {
  const result = await upsertServiceDraft(
    ACTIVITY_ID,
    { guideId: GUIDE_ID, name: '草稿名', descriptions: ['一段說明'] },
    0,
  );
  assert.equal(result.ok, true);
  assert.equal(result.conflict, false);
  assert.equal(result.status, 200);
  assert.equal(result.draft.revision, 1);
  assert.equal(result.draft.status, 'active');
  assert.equal(result.draft.activityId, ACTIVITY_ID);
  assert.equal(result.draft.guideId, GUIDE_ID);
  assert.equal(result.draft.payload.name, '草稿名');
});

test('既有 active 草稿，帶正確 expectedRevision 存檔 → revision += 1', async () => {
  __seedMidaoServiceDraftForTest({
    activityId: ACTIVITY_ID,
    guideId: GUIDE_ID,
    revision: 3,
    payload: { name: '舊名' },
  });
  const result = await upsertServiceDraft(ACTIVITY_ID, { name: '新名' }, 3);
  assert.equal(result.ok, true);
  assert.equal(result.draft.revision, 4);
  assert.equal(result.draft.payload.name, '新名');
});

test('存檔會 merge payload（保留未變更欄位）', async () => {
  __seedMidaoServiceDraftForTest({
    activityId: ACTIVITY_ID,
    guideId: GUIDE_ID,
    revision: 1,
    payload: { name: '原名', descriptions: ['原說明'] },
  });
  const result = await upsertServiceDraft(ACTIVITY_ID, { name: '改名' }, 1);
  assert.equal(result.ok, true);
  assert.equal(result.draft.payload.name, '改名');
  assert.deepEqual(result.draft.payload.descriptions, ['原說明']);
});

test('完整草稿存檔會附上 publicationPreview（valid=true）作為預先提示', async () => {
  const result = await upsertServiceDraft(
    ACTIVITY_ID,
    { guideId: GUIDE_ID, ...completePayload() },
    0,
  );
  assert.equal(result.ok, true);
  assert.equal(result.publicationPreview.valid, true);
  assert.deepEqual(result.publicationPreview.errors, []);
});

test('不完整草稿仍可存檔成功，但 publicationPreview.valid=false（不阻擋存草稿）', async () => {
  const result = await upsertServiceDraft(
    ACTIVITY_ID,
    { guideId: GUIDE_ID, name: '只有名字' },
    0,
  );
  assert.equal(result.ok, true, '草稿允許不完整，存檔要成功');
  assert.equal(result.draft.revision, 1);
  assert.equal(result.publicationPreview.valid, false);
  assert.ok(result.publicationPreview.errors.length >= 1);
});

// ---------------------------------------------------------------------------
// 2) revision 不符 → 409 衝突（不覆蓋）。
// ---------------------------------------------------------------------------
test('expectedRevision 落後 → 回 409 衝突，且不覆蓋現有草稿', async () => {
  __seedMidaoServiceDraftForTest({
    activityId: ACTIVITY_ID,
    guideId: GUIDE_ID,
    revision: 5,
    payload: { name: '別人已存的版本' },
  });
  const result = await upsertServiceDraft(ACTIVITY_ID, { name: '我想蓋掉' }, 2);
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.code, 'REVISION_CONFLICT');
  assert.equal(result.status, 409);
  assert.equal(result.currentRevision, 5);
  // 回傳目前最新版讓前端重新讀取，內容不能被覆蓋。
  assert.equal(result.draft.revision, 5);
  assert.equal(result.draft.payload.name, '別人已存的版本');

  const after = await getServiceDraft(ACTIVITY_ID);
  assert.equal(after.draft.revision, 5);
  assert.equal(after.draft.payload.name, '別人已存的版本');
});

test('已存在 active 草稿卻用 expectedRevision=0（誤以為新建）→ 409 衝突', async () => {
  __seedMidaoServiceDraftForTest({ activityId: ACTIVITY_ID, guideId: GUIDE_ID, revision: 1 });
  const result = await upsertServiceDraft(ACTIVITY_ID, { name: 'x' }, 0);
  assert.equal(result.conflict, true);
  assert.equal(result.status, 409);
  assert.equal(result.currentRevision, 1);
});

// ---------------------------------------------------------------------------
// 3) 問卷題目在存檔前驗證（S2 重用）。
// ---------------------------------------------------------------------------
test('payload.questions 內含不合法題目 → 422，不寫入', async () => {
  const result = await upsertServiceDraft(
    ACTIVITY_ID,
    { guideId: GUIDE_ID, name: 'x', questions: [validQuestion({ type: 'dropdown' })] },
    0,
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_QUESTIONNAIRE');
  assert.equal(result.status, 422);
  assert.match(result.validation.errors.join(' '), /type/);
  const after = await getServiceDraft(ACTIVITY_ID);
  assert.equal(after.draft, null, '驗證失敗不得建立草稿');
});

test('payload.questions 全部合法 → 存檔成功', async () => {
  const result = await upsertServiceDraft(
    ACTIVITY_ID,
    {
      guideId: GUIDE_ID,
      name: 'x',
      questions: [validQuestion(), validQuestion({ question_key: 'group_size', type: 'single_choice', options: ['1-2', '3-5'] })],
    },
    0,
  );
  assert.equal(result.ok, true);
  assert.equal(result.draft.revision, 1);
});

// ---------------------------------------------------------------------------
// 4) get 語意。
// ---------------------------------------------------------------------------
test('getServiceDraft 只回 active 草稿；沒有時回 null', async () => {
  const empty = await getServiceDraft(ACTIVITY_ID);
  assert.equal(empty.ok, true);
  assert.equal(empty.draft, null);

  __seedMidaoServiceDraftForTest({ activityId: ACTIVITY_ID, guideId: GUIDE_ID, revision: 2 });
  const found = await getServiceDraft(ACTIVITY_ID);
  assert.equal(found.draft.revision, 2);
  assert.equal(found.draft.status, 'active');
});

test('discarded 草稿不會被 get 當成 active 回傳', async () => {
  __seedMidaoServiceDraftForTest({
    activityId: ACTIVITY_ID,
    guideId: GUIDE_ID,
    revision: 2,
    status: 'discarded',
  });
  const result = await getServiceDraft(ACTIVITY_ID);
  assert.equal(result.draft, null);
});

// ---------------------------------------------------------------------------
// 5) discard 需要正確 revision。
// ---------------------------------------------------------------------------
test('discard 帶正確 revision → status 變 discarded、revision += 1', async () => {
  __seedMidaoServiceDraftForTest({ activityId: ACTIVITY_ID, guideId: GUIDE_ID, revision: 4 });
  const result = await discardServiceDraft(ACTIVITY_ID, 4);
  assert.equal(result.ok, true);
  assert.equal(result.draft.status, 'discarded');
  assert.equal(result.draft.revision, 5);
  const after = await getServiceDraft(ACTIVITY_ID);
  assert.equal(after.draft, null, 'discard 後不再有 active 草稿');
});

test('discard revision 不符 → 409 衝突，草稿仍為 active', async () => {
  __seedMidaoServiceDraftForTest({ activityId: ACTIVITY_ID, guideId: GUIDE_ID, revision: 4 });
  const result = await discardServiceDraft(ACTIVITY_ID, 1);
  assert.equal(result.conflict, true);
  assert.equal(result.status, 409);
  assert.equal(result.currentRevision, 4);
  const after = await getServiceDraft(ACTIVITY_ID);
  assert.equal(after.draft.status, 'active');
  assert.equal(after.draft.revision, 4);
});

test('discard 沒有 active 草稿 → 404', async () => {
  const result = await discardServiceDraft(ACTIVITY_ID, 1);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_FOUND');
  assert.equal(result.status, 404);
});

test('discard expectedRevision < 1 → 422（discard 必針對既有草稿）', async () => {
  __seedMidaoServiceDraftForTest({ activityId: ACTIVITY_ID, guideId: GUIDE_ID, revision: 2 });
  const result = await discardServiceDraft(ACTIVITY_ID, 0);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_EXPECTED_REVISION');
  assert.equal(result.status, 422);
});

// ---------------------------------------------------------------------------
// 6) 輸入驗證。
// ---------------------------------------------------------------------------
test('activityId 非 UUID → 422', async () => {
  const g = await getServiceDraft('not-a-uuid');
  assert.equal(g.code, 'INVALID_ACTIVITY_ID');
  assert.equal(g.status, 422);
  const u = await upsertServiceDraft('not-a-uuid', { name: 'x' }, 0);
  assert.equal(u.code, 'INVALID_ACTIVITY_ID');
});

test('patch 非物件 → 422', async () => {
  const result = await upsertServiceDraft(ACTIVITY_ID, 'nope', 0);
  assert.equal(result.code, 'INVALID_PATCH');
  assert.equal(result.status, 422);
});

test('expectedRevision 非整數 → 422', async () => {
  const result = await upsertServiceDraft(ACTIVITY_ID, { name: 'x' }, 1.5);
  assert.equal(result.code, 'INVALID_EXPECTED_REVISION');
  assert.equal(result.status, 422);
});

test('新建缺 guideId → 422', async () => {
  const result = await upsertServiceDraft(ACTIVITY_ID, { name: 'x' }, 0);
  assert.equal(result.code, 'INVALID_PATCH');
  assert.equal(result.status, 422);
});

// ---------------------------------------------------------------------------
// 7) Supabase parity — 相同呼叫在 Supabase 路徑行為一致。
// ---------------------------------------------------------------------------
function createSupabaseFake(initialRows = []) {
  // 以單表 in-memory 陣列模擬 guide_service_drafts；支援本 gateway 用到的
  // select().eq().eq().maybeSingle()、update().eq()*3.select().maybeSingle()、
  // insert().select().maybeSingle()，並在 partial-unique（單一 active）上擋重複 insert。
  const rows = structuredClone(initialRows);
  const calls = [];

  function makeSelectQuery(table) {
    const filters = [];
    const query = {
      select() { return query; },
      eq(field, value) { filters.push([field, value]); return query; },
      maybeSingle() {
        const matched = rows.filter((r) => filters.every(([f, v]) => r[f] === v));
        return Promise.resolve({ data: matched[0] ? structuredClone(matched[0]) : null, error: null });
      },
    };
    return query;
  }

  return {
    calls,
    supabase: {
      from(table) {
        assert.equal(table, 'guide_service_drafts');
        return {
          select() { return makeSelectQuery(table); },
          update(patch) {
            calls.push({ type: 'update', patch: structuredClone(patch) });
            const filters = [];
            const q = {
              eq(field, value) { filters.push([field, value]); return q; },
              select() { return q; },
              maybeSingle() {
                const idx = rows.findIndex((r) => filters.every(([f, v]) => r[f] === v));
                if (idx === -1) return Promise.resolve({ data: null, error: null });
                rows[idx] = { ...rows[idx], ...patch };
                return Promise.resolve({ data: structuredClone(rows[idx]), error: null });
              },
            };
            return q;
          },
          insert(record) {
            calls.push({ type: 'insert', record: structuredClone(record) });
            const q = {
              select() { return q; },
              maybeSingle() {
                const clash = rows.some(
                  (r) => r.activity_id === record.activity_id && r.status === 'active',
                );
                if (clash) {
                  return Promise.resolve({ data: null, error: { code: '23505', message: 'unique_violation' } });
                }
                const inserted = { id: `id-${rows.length + 1}`, updated_at: CLOCK, ...record };
                rows.push(structuredClone(inserted));
                return Promise.resolve({ data: structuredClone(inserted), error: null });
              },
            };
            return q;
          },
        };
      },
    },
  };
}

function useSupabase(fake) {
  process.env.SUPABASE_URL = 'http://example.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  __setSupabaseClientForTest(fake.supabase);
}

test('parity: Supabase 路徑建立新草稿 revision=1', async () => {
  const fake = createSupabaseFake([]);
  useSupabase(fake);
  const result = await upsertServiceDraft(
    ACTIVITY_ID,
    { guideId: GUIDE_ID, name: 'x', descriptions: ['一段說明'] },
    0,
  );
  assert.equal(result.ok, true);
  assert.equal(result.draft.revision, 1);
  assert.equal(result.draft.status, 'active');
});

test('parity: Supabase 路徑 revision 不符 → 409 衝突且回最新版', async () => {
  const fake = createSupabaseFake([
    {
      id: 'id-1',
      activity_id: ACTIVITY_ID,
      guide_id: GUIDE_ID,
      revision: 7,
      status: 'active',
      payload: { name: '雲端最新' },
      updated_at: CLOCK,
    },
  ]);
  useSupabase(fake);
  const result = await upsertServiceDraft(ACTIVITY_ID, { name: '想蓋' }, 3);
  assert.equal(result.conflict, true);
  assert.equal(result.status, 409);
  assert.equal(result.currentRevision, 7);
  assert.equal(result.draft.payload.name, '雲端最新');
});

test('parity: Supabase 路徑正確 revision 更新 → revision += 1 並 merge', async () => {
  const fake = createSupabaseFake([
    {
      id: 'id-1',
      activity_id: ACTIVITY_ID,
      guide_id: GUIDE_ID,
      revision: 2,
      status: 'active',
      payload: { name: '舊', descriptions: ['保留'] },
      updated_at: CLOCK,
    },
  ]);
  useSupabase(fake);
  const result = await upsertServiceDraft(ACTIVITY_ID, { name: '新' }, 2);
  assert.equal(result.ok, true);
  assert.equal(result.draft.revision, 3);
  assert.equal(result.draft.payload.name, '新');
  assert.deepEqual(result.draft.payload.descriptions, ['保留']);
});

test('parity: Supabase 路徑 discard 帶正確 revision → discarded', async () => {
  const fake = createSupabaseFake([
    {
      id: 'id-1',
      activity_id: ACTIVITY_ID,
      guide_id: GUIDE_ID,
      revision: 3,
      status: 'active',
      payload: { name: 'x' },
      updated_at: CLOCK,
    },
  ]);
  useSupabase(fake);
  const result = await discardServiceDraft(ACTIVITY_ID, 3);
  assert.equal(result.ok, true);
  assert.equal(result.draft.status, 'discarded');
  assert.equal(result.draft.revision, 4);
});

test('parity: Supabase 路徑 get 只回 active', async () => {
  const fake = createSupabaseFake([
    {
      id: 'id-1',
      activity_id: OTHER_ACTIVITY_ID,
      guide_id: GUIDE_ID,
      revision: 9,
      status: 'discarded',
      payload: { name: '已捨棄' },
      updated_at: CLOCK,
    },
  ]);
  useSupabase(fake);
  const result = await getServiceDraft(OTHER_ACTIVITY_ID);
  assert.equal(result.draft, null);
});
