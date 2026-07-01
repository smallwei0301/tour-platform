import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyUpsertWithMissingColumnFallback,
} from '../../src/lib/activity-plans-insert-fallback.mjs';
import { importActivityPlansInsertOnlyDb } from '../../src/lib/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

describe('GH-904 applyUpsertWithMissingColumnFallback (bulk-upsert array variant)', () => {
  it('succeeds immediately when no error', async () => {
    let calls = 0;
    const rows = [{ slug: 'a', highlights: ['x'] }, { slug: 'b', highlights: ['y'] }];
    const result = await applyUpsertWithMissingColumnFallback(async (r) => {
      calls++;
      return { data: r, error: null };
    }, rows);
    assert.equal(result.error, null);
    assert.deepEqual(result.droppedColumns, []);
    assert.equal(calls, 1);
  });

  it('strips a missing rich column from EVERY row and retries to success', async () => {
    const seen = [];
    const runOperation = async (r) => {
      seen.push(r.map((row) => ({ ...row })));
      if (r.some((row) => 'highlights' in row)) {
        return { data: null, error: { message: 'column "highlights" of relation "activity_plans" does not exist' } };
      }
      if (r.some((row) => 'plan_notices' in row)) {
        return { data: null, error: { message: "Could not find the 'plan_notices' column of 'activity_plans' in the schema cache" } };
      }
      return { data: r, error: null };
    };
    const rows = [
      { activity_id: 'a1', slug: 'half-day', name: 'P1', base_price: 100, highlights: ['h1'], plan_notices: ['n1'] },
      { activity_id: 'a1', slug: 'full-day', name: 'P2', base_price: 200, highlights: ['h2'], plan_notices: ['n2'] },
    ];
    const result = await applyUpsertWithMissingColumnFallback(runOperation, rows);

    assert.equal(result.error, null);
    assert.deepEqual(result.droppedColumns.sort(), ['highlights', 'plan_notices']);
    // 3 attempts: original, minus highlights, minus highlights+plan_notices
    assert.equal(seen.length, 3);
    // Final attempt: every row keeps basic fields, drops both rich columns
    for (const row of seen[2]) {
      assert.ok(!('highlights' in row));
      assert.ok(!('plan_notices' in row));
      assert.ok('slug' in row && 'name' in row && 'base_price' in row);
    }
  });

  it('does NOT mutate the caller-provided rows array', async () => {
    const rows = [{ slug: 'a', highlights: ['x'] }];
    const runOperation = async (r) =>
      r.some((row) => 'highlights' in row)
        ? { data: null, error: { message: 'column "highlights" does not exist' } }
        : { data: r, error: null };
    await applyUpsertWithMissingColumnFallback(runOperation, rows);
    assert.deepEqual(rows[0], { slug: 'a', highlights: ['x'] }, 'original rows must be untouched');
  });

  it('bails (returns original error) when the missing column is NOT rich (e.g. slug)', async () => {
    const slugError = { message: 'column "slug" of relation "activity_plans" does not exist' };
    const result = await applyUpsertWithMissingColumnFallback(
      async () => ({ data: null, error: slugError }),
      [{ slug: 'a', name: 'P' }],
    );
    assert.equal(result.error, slugError);
    assert.deepEqual(result.droppedColumns, []);
  });

  it('bails for unrelated DB errors (e.g. duplicate key)', async () => {
    const dupError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const result = await applyUpsertWithMissingColumnFallback(
      async () => ({ data: null, error: dupError }),
      [{ slug: 'a', highlights: ['x'] }],
    );
    assert.equal(result.error, dupError);
    assert.deepEqual(result.droppedColumns, []);
  });
});

// #admin-plan-revert 後續：舊版 activities.plans 回寫已廢除；schema-lag 容錯改由 V2
// insert-only 匯入（importActivityPlansInsertOnlyDb 內每筆走 applyWithMissingColumnFallback）承接。
describe('GH-904 V2 insert-only import degrades gracefully when schema lacks rich columns', () => {
  it('strips a missing rich column and still inserts the plan (per-row fallback)', async () => {
    const inserted = [];
    const sb = {
      from() {
        return {
          // 既有 slug 查詢：.select('slug').eq('activity_id', id)
          select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
          // insert(payload).select('id').single()：payload 仍含 highlights 時報缺欄位，剝除後成功。
          insert: (payload) => {
            inserted.push({ ...payload });
            const hasMissingRich = 'highlights' in payload;
            return {
              select: () => ({
                single: () => Promise.resolve(
                  hasMissingRich
                    ? { data: null, error: { message: 'column "highlights" of relation "activity_plans" does not exist' } }
                    : { data: { id: 'new' }, error: null },
                ),
              }),
            };
          },
        };
      },
    };

    const summary = await importActivityPlansInsertOnlyDb(sb, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', [
      { name: '祕境半日遊', slug: 'half-day', basePrice: 3600, highlights: ['中文方案亮點'], planInclusions: ['導覽'] },
    ]);

    assert.equal(summary.created, 1, '剝除缺欄位後仍成功建立方案');
    assert.deepEqual(summary.droppedColumns, ['highlights']);
    // 兩次 insert：首次含 highlights（失敗）、剝除後成功。
    assert.equal(inserted.length, 2);
    assert.ok('highlights' in inserted[0], '首次嘗試仍帶 highlights');
    assert.ok(!('highlights' in inserted[1]), '重試已剝除 highlights');
    assert.equal(inserted[1].name, '祕境半日遊', '基本欄位保留');
    assert.equal(inserted[1].base_price, 3600);
  });
});
