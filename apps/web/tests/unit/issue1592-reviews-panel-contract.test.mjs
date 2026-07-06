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

test('T1592ui.1 — 面板接上 buildRatingDistribution/filterReviews 並併入暖場評論', () => {
  assert.match(PANEL, /import\s*\{[^}]*buildRatingDistribution[^}]*filterReviews[^}]*toReviewDisplayList[^}]*\}\s*from\s*['"][^'"]*review-distribution\.mjs['"]/);
  // 真實評論 + 暖場語錄合併後才餵給分佈/篩選（暖場進入正式評論邏輯）
  assert.match(PANEL, /toReviewDisplayList\(reviews,\s*warmQuotes\)/);
  assert.match(PANEL, /buildRatingDistribution\(items\)/);
  assert.match(PANEL, /filterReviews\(items,\s*\{\s*rating:\s*ratingFilter,\s*withPhotos\s*\}/);
});

test('T1592ui.2 — 面板渲染導遊回覆（guideReply）', () => {
  assert.match(PANEL, /\.guideReply/);
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
