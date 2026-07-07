/**
 * Issue #1592 — buildRatingDistribution 純函式測試。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRatingDistribution, toReviewDisplayList } from '../../src/lib/review-distribution.mjs';

test('T1592.1 — 混合星等：counts/avg/percents 正確', () => {
  const r = buildRatingDistribution([
    { rating: 5 }, { rating: 5 }, { rating: 4 }, { rating: 3 }, { rating: 1 },
  ]);
  assert.equal(r.total, 5);
  assert.deepEqual(r.counts, { 1: 1, 2: 0, 3: 1, 4: 1, 5: 2 });
  assert.equal(r.avg, 3.6); // (5+5+4+3+1)/5 = 3.6
  assert.equal(r.percents[5], 40);
  assert.equal(r.percents[1], 20);
});

test('T1592.2 — 空列表：total 0、avg 0、percents 全 0（不除零）', () => {
  const r = buildRatingDistribution([]);
  assert.equal(r.total, 0);
  assert.equal(r.avg, 0);
  assert.deepEqual(r.percents, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
});

test('T1592.3 — 非法/越界 rating 被忽略', () => {
  const r = buildRatingDistribution([
    { rating: 5 }, { rating: 0 }, { rating: 6 }, { rating: null }, { rating: 'x' }, {},
  ]);
  assert.equal(r.total, 1);
  assert.equal(r.counts[5], 1);
});

test('T1592.4 — 字串/小數 rating 四捨五入納入', () => {
  const r = buildRatingDistribution([{ rating: '4' }, { rating: 4.4 }, { rating: 4.6 }]);
  assert.equal(r.counts[4], 2); // '4' 與 4.4→4
  assert.equal(r.counts[5], 1); // 4.6→5
});

test('T1592.5 — 全同分：該星 100%', () => {
  const r = buildRatingDistribution([{ rating: 5 }, { rating: 5 }, { rating: 5 }]);
  assert.equal(r.percents[5], 100);
  assert.equal(r.avg, 5);
});

test('T1592.6 — toReviewDisplayList：真實在前、暖場在後、帶 isWarm 旗標', () => {
  const merged = toReviewDisplayList(
    [{ id: 'r1', rating: 4, guideReply: { text: '謝謝' } }],
    [{ author: 'Grace', rating: 5, text: '很棒', photos: ['a.jpg'] }],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'r1');
  assert.equal(merged[0].isWarm, false);
  assert.equal(merged[1].isWarm, true);
  assert.equal(merged[1].id, 'warm-0'); // 穩定 key
  assert.deepEqual(merged[1].photos, ['a.jpg']);
});

test('T1592.7 — 暖場評論併入分佈：僅暖場也能算出 total>0', () => {
  // 只有暖場評論、無正式評論 → 過去 dist.total=0 導致長條/篩選不顯示（本次修復目標）
  const merged = toReviewDisplayList([], [
    { author: 'A', rating: 5, text: 'x' },
    { author: 'B', rating: 4, text: 'y' },
    { author: 'C', rating: 5, text: 'z' },
  ]);
  const dist = buildRatingDistribution(merged);
  assert.equal(dist.total, 3);
  assert.equal(dist.counts[5], 2);
  assert.equal(dist.counts[4], 1);
  assert.equal(dist.percents[5], 67); // 2/3 四捨五入
});

test('T1592.8 — toReviewDisplayList：非陣列輸入安全回空', () => {
  assert.deepEqual(toReviewDisplayList(null, undefined), []);
  assert.deepEqual(toReviewDisplayList(undefined, null), []);
});
