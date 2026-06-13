// 首頁精選 missing-table 偵測純函式單測（#admin 首頁精選錯誤修復）
// 對應線上事故：PostgREST 回 "Could not find the table
// 'public.homepage_featured_settings' in the schema cache"（migration 未套用）。
import test from 'node:test';
import assert from 'node:assert/strict';

const { isMissingHomepageFeaturedTable, HOMEPAGE_FEATURED_TABLE_MISSING_MESSAGE } = await import(
  '../../src/lib/homepage-featured-error.mjs'
);

test('PostgREST PGRST205（schema cache 找不到表）→ true', () => {
  assert.equal(
    isMissingHomepageFeaturedTable({
      code: 'PGRST205',
      message: "Could not find the table 'public.homepage_featured_settings' in the schema cache",
    }),
    true,
  );
});

test('只看 message（schema cache + 表名）也能判定 → true', () => {
  assert.equal(
    isMissingHomepageFeaturedTable({
      message: "Could not find the table 'public.homepage_featured_settings' in the schema cache",
    }),
    true,
  );
});

test('Postgres undefined_table 42P01 → true', () => {
  assert.equal(isMissingHomepageFeaturedTable({ code: '42P01', message: 'relation "homepage_featured_settings" does not exist' }), true);
});

test('relation does not exist（無 code）→ true', () => {
  assert.equal(
    isMissingHomepageFeaturedTable({ message: 'relation "homepage_featured_settings" does not exist' }),
    true,
  );
});

test('其他資料表的 schema-cache 錯誤 → false（不誤判）', () => {
  assert.equal(
    isMissingHomepageFeaturedTable({
      code: 'PGRST205',
      message: "Could not find the table 'public.activity_plan_seasons' in the schema cache",
    }),
    false,
  );
});

test('一般錯誤 / null / undefined → false', () => {
  assert.equal(isMissingHomepageFeaturedTable(null), false);
  assert.equal(isMissingHomepageFeaturedTable(undefined), false);
  assert.equal(isMissingHomepageFeaturedTable({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isMissingHomepageFeaturedTable({ message: 'network error' }), false);
});

test('提供可執行的繁中操作訊息（提示套用 migration）', () => {
  assert.equal(typeof HOMEPAGE_FEATURED_TABLE_MISSING_MESSAGE, 'string');
  assert.match(HOMEPAGE_FEATURED_TABLE_MISSING_MESSAGE, /migration/);
  assert.match(HOMEPAGE_FEATURED_TABLE_MISSING_MESSAGE, /homepage_featured_settings/);
});
