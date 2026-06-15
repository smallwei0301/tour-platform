/**
 * 收藏愛心 + 列表真實星數 + 評價照片上傳
 *
 * 1) listPublishedActivitiesDb（in-memory fallback）回傳每筆行程自身的
 *    `reviews`（真實評論星數）與 `socialProofQuotes`，且 reviewCount 為「真實評論數」，
 *    不再是寫死的 5.0 / guide 評分 —— 讓列表卡與詳情頁用同一真實來源。
 * 2) resolveActivityReviewStats 對列表 item 與詳情頁 activity 算出一致的 count。
 * 3) POST /api/reviews 接受 photoUrls（限本平台 review-photos bucket、上限 5、含 schema-drift fallback）。
 * 4) /api/reviews/upload-photo 上傳 route 接線（旅客 auth + bucket）。
 * 5) WishlistToggle 不依賴 Tailwind utility class（本專案無 Tailwind），改用 inline style。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { resolveActivityReviewStats } from '../../src/lib/activity-review-stats.mjs';

// ── 列表真實星數：listPublishedActivitiesDb 的 source-contract ───────────────
// （db.mjs 內 fixtures 的 dynamic import 走 bundler 解析，raw node test 不觸發 fallback，
//   故以 source-contract 鎖定「每筆行程帶 reviews/socialProofQuotes、reviewCount=真實評論數」。）
const dbSrc = readFileSync(path.resolve('src/lib/db.mjs'), 'utf8');

test('列表: 不再用 guide 評分寫死 5.0；改帶行程自身 reviews/socialProofQuotes', () => {
  const listFn = dbSrc.slice(
    dbSrc.indexOf('export async function listPublishedActivitiesDb'),
    dbSrc.indexOf('export async function', dbSrc.indexOf('export async function listPublishedActivitiesDb') + 1),
  );
  assert.ok(listFn.length > 0, '應找到 listPublishedActivitiesDb');
  assert.doesNotMatch(listFn, /guide\?\.rating\s*\|\|\s*5\.0/, '不應再寫死 guide 評分或 5.0');
  // 兩條分支（fallback + supabase）都應帶上 reviews 與 socialProofQuotes
  assert.match(listFn, /reviews:/, '回傳應帶 reviews');
  assert.match(listFn, /socialProofQuotes:/, '回傳應帶 socialProofQuotes');
  // supabase 分支應批次撈 approved 評論
  assert.match(listFn, /activity_reviews[\s\S]*?status'?,?\s*['"]approved['"]/, '應撈 approved 評論彙總');
});

// ── resolveActivityReviewStats 為列表卡與詳情頁共用真實來源（pure unit）──────
test('列表卡與詳情頁同源：count = 真實評論 + 社群口碑語錄，score 夾 0–5', () => {
  const item = {
    ratingAvg: null,
    reviews: [{ rating: 5 }, { rating: 4 }, { rating: 3 }],
    socialProofQuotes: [{ author: 'A', rating: 5, text: 'good' }],
  };
  const stats = resolveActivityReviewStats(item);
  assert.equal(stats.count, 4, 'count = 3 真實 + 1 語錄');
  assert.equal(stats.score, 4.3, '(5+4+3+5)/4 = 4.25 → 4.3'); // 一位小數四捨五入
  assert.ok(stats.score >= 0 && stats.score <= 5);

  // 無任何評論 → count 0（列表卡據此顯示「尚無評價」而非 5.0 (0則)）
  const empty = resolveActivityReviewStats({ ratingAvg: null, reviews: [], socialProofQuotes: [] });
  assert.equal(empty.count, 0);
});

// ── source-contract：reviews route 接受並驗證 photoUrls ──────────────────────

const reviewsRouteSrc = readFileSync(path.resolve('app/api/reviews/route.ts'), 'utf8');

test('接線: POST /api/reviews 解析 photoUrls 並只收 review-photos bucket 的 public URL', () => {
  assert.match(reviewsRouteSrc, /photoUrls/, '應解析 photoUrls');
  assert.match(reviewsRouteSrc, /review-photos/, '應限定 review-photos bucket public URL');
  assert.match(reviewsRouteSrc, /REVIEW_PHOTO_MAX|slice\(0,\s*\d/, '應限制照片數量上限');
  assert.match(reviewsRouteSrc, /photo_urls/, 'insert 應帶 photo_urls');
});

test('接線: photo_urls 欄位缺失（42703）時退回不含照片的 insert（schema-drift guard）', () => {
  assert.match(reviewsRouteSrc, /42703/, '應有 schema-drift guard');
});

const uploadRouteSrc = readFileSync(path.resolve('app/api/reviews/upload-photo/route.ts'), 'utf8');

test('接線: upload-photo 需登入旅客 + 上傳到 review-photos bucket', () => {
  assert.match(uploadRouteSrc, /auth\.getUser\(\)/, '需驗證旅客 session');
  assert.match(uploadRouteSrc, /UNAUTHORIZED/, '未登入應 401');
  assert.match(uploadRouteSrc, /review-photos/, '應上傳到 review-photos bucket');
  assert.match(uploadRouteSrc, /image\/jpeg|image\/png|image\/webp/, '應限制圖片類型');
});

// ── source-contract：WishlistToggle 不依賴 Tailwind ─────────────────────────

const toggleSrc = readFileSync(path.resolve('src/components/WishlistToggle.tsx'), 'utf8');

test('接線: WishlistToggle 用 inline style（本專案無 Tailwind），愛心有明確尺寸', () => {
  // 不應再以 Tailwind utility class 設定尺寸/形狀（會渲染成空白方塊）
  assert.doesNotMatch(toggleSrc, /className=\{`[^`]*w-10[^`]*`\}/, '不應用 Tailwind w-10 設尺寸');
  assert.match(toggleSrc, /width:\s*40|width=\{40\}/, '按鈕/圖示應有 inline 尺寸');
  assert.match(toggleSrc, /borderRadius:\s*'50%'/, '應為圓形');
  assert.match(toggleSrc, /variant/, '應提供 overlay/inline 變體');
});
