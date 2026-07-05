/**
 * Issue #1592 — buildRatingDistribution 純函式測試。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRatingDistribution } from '../../src/lib/review-distribution.mjs';

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
