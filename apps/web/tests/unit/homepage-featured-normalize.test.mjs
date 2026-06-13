// 首頁精選純邏輯單測：normalize（驗證/去重/衝突排除）與 resolve（fail-open 預設）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHomepageFeatured,
  resolveHomepageSelection,
  HOMEPAGE_DEFAULT_EDITOR_PICK,
  HOMEPAGE_MORE_FEATURED_LIMIT,
} from '../../src/lib/homepage-featured.mjs';

const CATALOG = [
  'kaohsiung-chaishan-cave-experience',
  'dadadaocheng-walk',
  'taipei-night-market-food-tour',
  'hualien-river-trekking',
];

test('normalize: 合法輸入原樣通過', () => {
  const out = normalizeHomepageFeatured(
    { editorPickSlug: 'hualien-river-trekking', moreFeaturedSlugs: ['dadadaocheng-walk'] },
    CATALOG,
  );
  assert.equal(out.editorPickSlug, 'hualien-river-trekking');
  assert.deepEqual(out.moreFeaturedSlugs, ['dadadaocheng-walk']);
  assert.deepEqual(out.errors, []);
});

test('normalize: 編輯精選自動從更多精選排除（衝突防呆）', () => {
  const out = normalizeHomepageFeatured(
    {
      editorPickSlug: 'hualien-river-trekking',
      moreFeaturedSlugs: ['hualien-river-trekking', 'dadadaocheng-walk'],
    },
    CATALOG,
  );
  assert.deepEqual(out.moreFeaturedSlugs, ['dadadaocheng-walk']);
  assert.deepEqual(out.errors, []);
});

test('normalize: 重複 slug 去重、空字串忽略', () => {
  const out = normalizeHomepageFeatured(
    { editorPickSlug: null, moreFeaturedSlugs: ['dadadaocheng-walk', 'dadadaocheng-walk', '', '  '] },
    CATALOG,
  );
  assert.deepEqual(out.moreFeaturedSlugs, ['dadadaocheng-walk']);
  assert.deepEqual(out.errors, []);
});

test('normalize: 不存在的 slug 回報錯誤', () => {
  const out = normalizeHomepageFeatured(
    { editorPickSlug: 'not-a-tour', moreFeaturedSlugs: ['ghost-tour'] },
    CATALOG,
  );
  assert.equal(out.errors.length, 2);
  assert.match(out.errors[0], /editorPickSlug 不存在/);
  assert.match(out.errors[1], /moreFeaturedSlugs 不存在/);
});

test('normalize: 超過上限回報錯誤', () => {
  const many = Array.from({ length: HOMEPAGE_MORE_FEATURED_LIMIT + 1 }, (_, i) => `t${i}`);
  const out = normalizeHomepageFeatured({ moreFeaturedSlugs: many }, []);
  assert.equal(out.errors.length, 1);
  assert.match(out.errors[0], /最多/);
});

test('normalize: validSlugs 為空時不做存在性驗證', () => {
  const out = normalizeHomepageFeatured({ editorPickSlug: 'anything' }, []);
  assert.equal(out.editorPickSlug, 'anything');
  assert.deepEqual(out.errors, []);
});

test('resolve: 未設定時 fail-open 預設（柴山＋其餘前 2）', () => {
  const out = resolveHomepageSelection(null, CATALOG);
  assert.equal(out.editorPickSlug, HOMEPAGE_DEFAULT_EDITOR_PICK);
  assert.deepEqual(out.tourSlugs, ['dadadaocheng-walk', 'taipei-night-market-food-tour']);
});

test('resolve: 選溯溪當編輯精選 → 大卡換溯溪、更多精選自動排除溯溪', () => {
  const out = resolveHomepageSelection(
    { editorPickSlug: 'hualien-river-trekking', moreFeaturedSlugs: ['hualien-river-trekking', 'kaohsiung-chaishan-cave-experience'] },
    CATALOG,
  );
  assert.equal(out.editorPickSlug, 'hualien-river-trekking');
  assert.deepEqual(out.tourSlugs, ['kaohsiung-chaishan-cave-experience']);
});

test('resolve: 設定的 slug 已不在目錄（下架）→ 退回預設', () => {
  const out = resolveHomepageSelection(
    { editorPickSlug: 'removed-tour', moreFeaturedSlugs: ['also-removed'] },
    CATALOG,
  );
  assert.equal(out.editorPickSlug, HOMEPAGE_DEFAULT_EDITOR_PICK);
  assert.deepEqual(out.tourSlugs, ['dadadaocheng-walk', 'taipei-night-market-food-tour']);
});

test('resolve: 目錄不含預設柴山時退回目錄第一個', () => {
  const out = resolveHomepageSelection(null, ['a-tour', 'b-tour']);
  assert.equal(out.editorPickSlug, 'a-tour');
  assert.deepEqual(out.tourSlugs, ['b-tour']);
});
