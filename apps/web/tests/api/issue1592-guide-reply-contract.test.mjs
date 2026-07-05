/**
 * Issue #1592 — 導遊回覆評論 db 層（in-memory fallback）＋評論篩選 契約測試。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  upsertGuideReplyDb, normalizeGuideReply, GUIDE_REPLY_MAX_CHARS, listGuideReviewsDb,
  __seedMemReviews, __getMemReviews, __resetMemReviews,
} from '../../src/lib/db-review-reply.mjs';
import { filterReviews } from '../../src/lib/review-distribution.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const NOW = '2026-07-05T00:00:00Z';

test('T1592.1 — 導遊可回覆自己活動下的評論，覆寫與撤下', async () => {
  __resetMemReviews();
  __seedMemReviews(
    [{ id: 'rev1', activity_slug: 'act-a' }],
    { 'act-a': 'guide-1' },
  );
  const r = await upsertGuideReplyDb({ guideId: 'guide-1', reviewId: 'rev1', replyText: '謝謝您的參與！', now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.replied, true);
  assert.equal(r.replyAt, NOW);
  assert.equal(__getMemReviews()[0].guide_reply_text, '謝謝您的參與！');

  // 覆寫
  await upsertGuideReplyDb({ guideId: 'guide-1', reviewId: 'rev1', replyText: '期待再相見', now: '2026-07-06T00:00:00Z' });
  assert.equal(__getMemReviews()[0].guide_reply_text, '期待再相見');

  // 空字串＝撤下
  const cleared = await upsertGuideReplyDb({ guideId: 'guide-1', reviewId: 'rev1', replyText: '   ', now: NOW });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.replied, false);
  assert.equal(__getMemReviews()[0].guide_reply_text, null);
  assert.equal(__getMemReviews()[0].guide_reply_at, null);
});

test('T1592.2 — 非活動所屬導遊回覆 → 403，評論不存在 → 404', async () => {
  __resetMemReviews();
  __seedMemReviews([{ id: 'rev1', activity_slug: 'act-a' }], { 'act-a': 'guide-1' });
  const forbidden = await upsertGuideReplyDb({ guideId: 'guide-2', reviewId: 'rev1', replyText: 'x', now: NOW });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.code, 'NOT_OWNING_GUIDE');

  const missing = await upsertGuideReplyDb({ guideId: 'guide-1', reviewId: 'nope', replyText: 'x', now: NOW });
  assert.equal(missing.status, 404);
});

test('T1592.3 — 回覆長度上限與型別守門', () => {
  assert.equal(normalizeGuideReply(null).text, null);
  assert.equal(normalizeGuideReply('  hi  ').text, 'hi');
  assert.equal(normalizeGuideReply(123).ok, false);
  const tooLong = normalizeGuideReply('a'.repeat(GUIDE_REPLY_MAX_CHARS + 1));
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.code, 'REPLY_TOO_LONG');
});

test('T1592.4 — filterReviews：星等＋只看含照片', () => {
  const reviews = [
    { rating: 5, photos: ['p1.jpg'] },
    { rating: 5, photos: [] },
    { rating: 3, photos: ['p2.jpg'] },
    { rating: 4 },
  ];
  assert.equal(filterReviews(reviews, { rating: 5 }).length, 2);
  assert.equal(filterReviews(reviews, { withPhotos: true }).length, 2);
  assert.equal(filterReviews(reviews, { rating: 5, withPhotos: true }).length, 1);
  // 無效星等＝不套用星等篩選
  assert.equal(filterReviews(reviews, { rating: 9 }).length, 4);
  assert.equal(filterReviews(reviews, {}).length, 4);
});

test('T1592.5 — strangler：導遊回覆 db 不進 db.mjs', () => {
  const dbSrc = readFileSync(path.join(ROOT, 'src/lib/db.mjs'), 'utf8');
  assert.ok(!/upsertGuideReplyDb|normalizeGuideReply|listGuideReviewsDb/.test(dbSrc), '導遊回覆 db 不得寫進 db.mjs');
});

test('T1592.6 — listGuideReviewsDb 只回自己活動的評論、含既有回覆', async () => {
  __resetMemReviews();
  __seedMemReviews(
    [
      { id: 'rev1', activity_slug: 'act-a', author: '小明', rating: 5, review_text: '很棒', review_date: '2026-07-01', guide_reply_text: '謝謝' },
      { id: 'rev2', activity_slug: 'act-a', author: '小華', rating: 4, review_text: '不錯' },
      { id: 'rev3', activity_slug: 'act-b', author: '別人', rating: 3, review_text: '普通' },
    ],
    { 'act-a': 'guide-1', 'act-b': 'guide-2' },
  );
  const list = await listGuideReviewsDb({ guideId: 'guide-1' });
  assert.deepEqual(list.map((r) => r.id).sort(), ['rev1', 'rev2']);
  const rev1 = list.find((r) => r.id === 'rev1');
  assert.equal(rev1.author, '小明');
  assert.equal(rev1.rating, 5);
  assert.deepEqual(rev1.guideReply, { text: '謝謝', at: null });
  const rev2 = list.find((r) => r.id === 'rev2');
  assert.equal(rev2.guideReply, null);
  // guide-2 只看得到自己的
  assert.deepEqual((await listGuideReviewsDb({ guideId: 'guide-2' })).map((r) => r.id), ['rev3']);
});

test('T1592.7 — 導遊後台評論頁與路由/導覽已接線', () => {
  const listRoute = readFileSync(path.join(ROOT, 'app/api/v2/guide/reviews/route.ts'), 'utf8');
  assert.match(listRoute, /verifyGuideSession/);
  assert.match(listRoute, /listGuideReviewsDb/);
  const page = readFileSync(path.join(ROOT, 'app/guide/reviews/page.tsx'), 'utf8');
  assert.match(page, /\/api\/v2\/guide\/reviews/);
  assert.match(page, /\/reply/);
  assert.match(page, /csrfHeaders/);
  const layout = readFileSync(path.join(ROOT, 'app/guide/layout.tsx'), 'utf8');
  assert.match(layout, /\/guide\/reviews/);
});
