/**
 * Issue #1557 — 活動列表排序純函式（健檢 v2 P1-6）。
 * rating 排序須與卡片顯示的星數同源（resolveActivityReviewStats），
 * 同分再依評論數多到少；recommended 維持原始順序（穩定）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { sortActivities } = await import('../../src/lib/activity-list-sort.mjs');

const A = { id: 'a', priceTwd: 3000, ratingAvg: 4.2, reviews: [{ rating: 4 }, { rating: 5 }] }; // score 4.2, count 2
const B = { id: 'b', priceTwd: 1000, ratingAvg: 5.0, reviews: [{ rating: 5 }] };                 // score 5.0, count 1
const C = { id: 'c', priceTwd: 2000, ratingAvg: 5.0, reviews: [{ rating: 5 }, { rating: 5 }, { rating: 5 }] }; // score 5.0, count 3
const D = { id: 'd', priceTwd: 500 };  // 無評論 → score 5.0（helper 預設）, count 0

describe('sortActivities', () => {
  it('recommended 維持原始順序、不變動陣列本體', () => {
    const input = [A, B, C, D];
    const out = sortActivities(input, 'recommended');
    assert.deepEqual(out.map((x) => x.id), ['a', 'b', 'c', 'd']);
    assert.notEqual(out, input, '應回傳新陣列，不就地改動');
    assert.deepEqual(input.map((x) => x.id), ['a', 'b', 'c', 'd'], '原陣列不被 mutate');
  });

  it('price-asc 由低到高', () => {
    assert.deepEqual(sortActivities([A, B, C, D], 'price-asc').map((x) => x.id), ['d', 'b', 'c', 'a']);
  });

  it('price-desc 由高到低', () => {
    assert.deepEqual(sortActivities([A, B, C, D], 'price-desc').map((x) => x.id), ['a', 'c', 'b', 'd']);
  });

  it('rating：分數高到低，同分依評論數多到少', () => {
    // score: B=5.0(1), C=5.0(3), D=5.0(0), A=4.2(2)
    // 5.0 群組內 count 多到少：C(3) > B(1) > D(0)，再來 A(4.2)
    assert.deepEqual(sortActivities([A, B, C, D], 'rating').map((x) => x.id), ['c', 'b', 'd', 'a']);
  });

  it('未知 sortKey → 當 recommended', () => {
    assert.deepEqual(sortActivities([A, B], 'nonsense').map((x) => x.id), ['a', 'b']);
  });

  it('空陣列/非陣列輸入不丟錯', () => {
    assert.deepEqual(sortActivities([], 'rating'), []);
    assert.deepEqual(sortActivities(undefined, 'rating'), []);
  });
});
