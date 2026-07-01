import { test } from 'node:test';
import assert from 'node:assert/strict';

import { importActivityPlansInsertOnlyDb } from '../../src/lib/db.mjs';

// #admin-plan-revert 後續：投稿／JSON 匯入的方案改走 V2 insert-only 寫入。
// 這支鎖定 gateway 行為：只讀既有 slug、只新增不存在的方案、撞唯一鍵視為跳過。

const ACTIVITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeSupabase({ existingSlugs = [], insertResults = [] } = {}) {
  const inserted = [];
  let insertCall = 0;
  const nextInsertResult = () => {
    const r = insertResults[insertCall] ?? { data: { id: `new-${insertCall}` }, error: null };
    insertCall += 1;
    return r;
  };
  return {
    inserted,
    from() {
      return {
        select() {
          return {
            // 既有 slug 清單查詢：.select('slug').eq('activity_id', id) 直接 await
            eq: () => Promise.resolve({ data: existingSlugs.map((slug) => ({ slug })), error: null }),
            // insert 後的 .select('id').single()
            single: () => Promise.resolve(nextInsertResult()),
          };
        },
        insert(payload) {
          inserted.push(payload);
          return {
            select: () => ({ single: () => Promise.resolve(nextInsertResult()) }),
          };
        },
      };
    },
  };
}

test('inserts only new plans, skips slugs that already exist', async () => {
  const sb = makeSupabase({ existingSlugs: ['half-day'] });

  const summary = await importActivityPlansInsertOnlyDb(sb, ACTIVITY_ID, [
    { name: 'Half Day', slug: 'half-day', basePrice: 1800 },   // 既有 → skip
    { name: 'Full Day', slug: 'full-day', basePrice: 3000, priceType: 'per_group' }, // 新 → insert
  ]);

  assert.equal(summary.created, 1);
  assert.equal(sb.inserted.length, 1);
  assert.equal(sb.inserted[0].slug, 'full-day');
  assert.equal(sb.inserted[0].price_type, 'per_group');
  assert.equal(summary.skipped.length, 1);
  assert.equal(summary.skipped[0].slug, 'half-day');
});

test('duplicate-key error during insert is treated as skip, not thrown', async () => {
  const sb = makeSupabase({
    existingSlugs: [],
    insertResults: [{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }],
  });

  const summary = await importActivityPlansInsertOnlyDb(sb, ACTIVITY_ID, [
    { name: 'Race Plan', slug: 'race-plan', basePrice: 1000 },
  ]);

  assert.equal(summary.created, 0);
  assert.equal(summary.skipped.length, 1);
  assert.equal(summary.skipped[0].reason, 'slug_exists');
});

test('non-duplicate insert error propagates', async () => {
  const sb = makeSupabase({
    existingSlugs: [],
    insertResults: [{ data: null, error: { code: '500', message: 'boom' } }],
  });

  await assert.rejects(
    () => importActivityPlansInsertOnlyDb(sb, ACTIVITY_ID, [{ name: 'X', slug: 'x', basePrice: 100 }]),
    /boom/,
  );
});
