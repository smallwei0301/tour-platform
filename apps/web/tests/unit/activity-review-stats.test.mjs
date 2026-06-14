import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveActivityReviewStats } from '../../src/lib/activity-review-stats.mjs';

test('count = 真實評論 + 暖場留言；score 取 ratingAvg', () => {
  const r = resolveActivityReviewStats({
    ratingAvg: 4.8,
    reviews: [{ rating: 5 }, { rating: 5 }, { rating: 4 }],
    socialProofQuotes: ['好讚', '很專業'],
  });
  assert.equal(r.count, 5); // 3 真實 + 2 暖場
  assert.equal(r.score, 4.8);
});

test('ratingAvg 缺漏時由真實評論平均', () => {
  const r = resolveActivityReviewStats({
    reviews: [{ rating: 5 }, { rating: 4 }],
    socialProofQuotes: ['x'],
  });
  assert.equal(r.count, 3);
  assert.equal(r.score, 4.5);
});

test('完全無資料 → score 5.0、count 0', () => {
  const r = resolveActivityReviewStats({});
  assert.equal(r.count, 0);
  assert.equal(r.score, 5.0);
});

test('暖場留言為空陣列也安全', () => {
  const r = resolveActivityReviewStats({ ratingAvg: 5, reviews: [{ rating: 5 }], socialProofQuotes: [] });
  assert.equal(r.count, 1);
  assert.equal(r.score, 5.0);
});

test('score 夾在 0–5 且保留一位小數', () => {
  const r = resolveActivityReviewStats({ ratingAvg: 9, reviews: [], socialProofQuotes: [] });
  assert.equal(r.score, 5.0);
});
