/**
 * Issue #1382 — 最近瀏覽（localStorage）純邏輯 + 推薦排除自身
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { pushRecentlyViewed, pickRecommendations } from '../../src/lib/recently-viewed.mjs';

const item = (slug, extra = {}) => ({ slug, title: slug, priceTwd: 1000, coverImageUrl: null, ...extra });

test('pushRecentlyViewed: 新項目放最前、去重、上限 10 筆', () => {
  let list = [];
  for (let i = 1; i <= 12; i += 1) list = pushRecentlyViewed(list, item(`a${i}`));
  assert.equal(list.length, 10, '上限 10 筆');
  assert.equal(list[0].slug, 'a12', '最新在前');
  assert.ok(!list.some((x) => x.slug === 'a1'), '最舊被擠出');

  list = pushRecentlyViewed(list, item('a5'));
  assert.equal(list[0].slug, 'a5', '重複瀏覽提到最前');
  assert.equal(list.filter((x) => x.slug === 'a5').length, 1, '不重複');
  assert.equal(list.length, 10);
});

test('pushRecentlyViewed: 防呆 — 非陣列輸入視為空、缺 slug 不寫入', () => {
  assert.equal(pushRecentlyViewed(undefined, item('x')).length, 1);
  assert.equal(pushRecentlyViewed('junk', item('x')).length, 1);
  assert.deepEqual(pushRecentlyViewed([], { title: 'no-slug' }), []);
});

test('pickRecommendations: 同地區/同類型各取 N、排除當前活動、不足時回空', () => {
  const all = [
    item('self', { region: '高雄', category: 'outdoor' }),
    item('r1', { region: '高雄', category: 'food' }),
    item('r2', { region: '高雄', category: 'outdoor' }),
    item('t1', { region: '台北', category: 'outdoor' }),
    item('x1', { region: '台北', category: 'food' }),
  ];

  const { sameRegion, sameCategory } = pickRecommendations(all, {
    currentSlug: 'self', region: '高雄', category: 'outdoor', limit: 4,
  });

  assert.deepEqual(sameRegion.map((a) => a.slug), ['r1', 'r2'], '同地區排除自身');
  assert.deepEqual(sameCategory.map((a) => a.slug), ['r2', 't1'], '同類型排除自身');

  const none = pickRecommendations(all, { currentSlug: 'self', region: '綠島', category: 'diving', limit: 4 });
  assert.deepEqual(none.sameRegion, []);
  assert.deepEqual(none.sameCategory, []);
});

test('pickRecommendations: limit 生效', () => {
  const all = [item('self', { region: 'R', category: 'C' })].concat(
    Array.from({ length: 6 }, (_, i) => item(`r${i}`, { region: 'R', category: 'C' }))
  );
  const { sameRegion } = pickRecommendations(all, { currentSlug: 'self', region: 'R', category: 'C', limit: 4 });
  assert.equal(sameRegion.length, 4);
});
