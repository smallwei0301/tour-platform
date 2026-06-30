import { test } from 'node:test';
import assert from 'node:assert/strict';

// 純查詢層（不依賴 next/cache）可直接 import 驗證；revalidatePath 串接由
// revalidate-activity-by-id.mjs 負責，並有 source-contract 測試鎖路由接線。
import { loadActivityRevalidateTarget } from '../../src/lib/activity-revalidate-target.mjs';

function makeSupabase(result, { throwOnSingle = false } = {}) {
  const calls = { select: null, eq: null, from: null, single: false };
  const builder = {
    select(cols) {
      calls.select = cols;
      return builder;
    },
    eq(col, val) {
      calls.eq = [col, val];
      return builder;
    },
    single() {
      calls.single = true;
      if (throwOnSingle) return Promise.reject(new Error('boom'));
      return Promise.resolve(result);
    },
  };
  return {
    from(table) {
      calls.from = table;
      return builder;
    },
    _calls: calls,
  };
}

test('queries activities by id and maps region_slug → regionSlug', async () => {
  const sb = makeSupabase({ data: { slug: 'ali-shan', region: '高雄市', region_slug: 'kaohsiung' }, error: null });

  const target = await loadActivityRevalidateTarget(sb, 'activity-uuid-1');

  assert.equal(sb._calls.from, 'activities');
  // 必須帶 region_slug —— 否則下游 revalidatePath 打不到實際被快取的詳情頁（#1440）。
  assert.match(sb._calls.select, /\bslug\b/);
  assert.match(sb._calls.select, /\bregion\b/);
  assert.match(sb._calls.select, /\bregion_slug\b/);
  assert.deepEqual(sb._calls.eq, ['id', 'activity-uuid-1']);
  assert.equal(sb._calls.single, true);
  assert.deepEqual(target, { region: '高雄市', regionSlug: 'kaohsiung', slug: 'ali-shan' });
});

test('returns null when the activity row is missing', async () => {
  const sb = makeSupabase({ data: null, error: { message: 'no rows' } });
  assert.equal(await loadActivityRevalidateTarget(sb, 'missing'), null);
});

test('best-effort: swallows query errors and returns null (never blocks the write)', async () => {
  const sb = makeSupabase(null, { throwOnSingle: true });
  assert.equal(await loadActivityRevalidateTarget(sb, 'activity-uuid-2'), null);
});
