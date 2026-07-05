/**
 * Issue #1592 — 活動頁評論面板（ActivityReviewsPanel）源碼契約測試。
 * 純源碼靜態檢查：面板須接上分佈/篩選純函式並渲染導遊回覆；活動頁須改用面板。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PANEL = readFileSync(path.join(ROOT, 'src/components/activity/ActivityReviewsPanel.tsx'), 'utf8');
const PAGE = readFileSync(
  path.join(ROOT, 'app/[locale]/activities/[region]/[slug]/page.tsx'),
  'utf8',
);

test('T1592ui.1 — 面板接上 buildRatingDistribution 與 filterReviews 純函式', () => {
  assert.match(PANEL, /import\s*\{[^}]*buildRatingDistribution[^}]*filterReviews[^}]*\}\s*from\s*['"][^'"]*review-distribution\.mjs['"]/);
  assert.match(PANEL, /buildRatingDistribution\(reviews\)/);
  assert.match(PANEL, /filterReviews\(reviews,\s*\{\s*rating:\s*ratingFilter,\s*withPhotos\s*\}/);
});

test('T1592ui.2 — 面板渲染導遊回覆（guideReply）', () => {
  assert.match(PANEL, /r\.guideReply/);
  assert.match(PANEL, /reviewsGuideReplyLabel/);
  assert.match(PANEL, /kkd-review-guide-reply/);
});

test('T1592ui.3 — 面板提供星等與有照片篩選 UI', () => {
  assert.match(PANEL, /setRatingFilter/);
  assert.match(PANEL, /setWithPhotos/);
  assert.match(PANEL, /reviewsFilterPhotos/);
  assert.match(PANEL, /reviewsFilterStar/);
});

test('T1592ui.4 — 活動頁改用 ActivityReviewsPanel（不再 inline map 評論）', () => {
  assert.match(PAGE, /import\s*\{\s*ActivityReviewsPanel\s*\}/);
  assert.match(PAGE, /<ActivityReviewsPanel\b/);
});

test('T1592ui.5 — i18n 兩語系皆有新評論篩選鍵', () => {
  const zh = readFileSync(path.join(ROOT, 'messages/zh-Hant.json'), 'utf8');
  const en = readFileSync(path.join(ROOT, 'messages/en.json'), 'utf8');
  for (const src of [zh, en]) {
    for (const key of ['reviewsFilterStar', 'reviewsFilterAll', 'reviewsFilterPhotos', 'reviewsGuideReplyLabel', 'reviewsEmptyFiltered']) {
      assert.ok(src.includes(`"${key}"`), `缺 i18n 鍵 ${key}`);
    }
  }
});
