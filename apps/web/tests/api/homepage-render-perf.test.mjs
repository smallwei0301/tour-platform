/**
 * 首頁渲染效能：移除 critical path 上的重量級 getActivityBySlugDb 詳情查詢。
 *
 * 首頁編輯精選大卡原本為了拿「相片集 + 評分」呼叫 getActivityBySlugDb，連帶撈了
 * guide_profiles／activity_schedules／activity_reviews／plans（約 4 個序列 round-trip），
 * 且序列接在 listPublishedActivitiesDb（本身 3 個序列查詢）之後 → 冷渲染要 ~數秒，
 * 也讓 admin 儲存精選後 on-demand 重生變慢（stale-while-revalidate 先回舊內容，
 * 看起來像「儲存沒即時出現」）。
 *
 * 修正：評分改由 catalog（editorPick.activity 即 catalog row）直接計算（0 額外查詢），
 * 相片集用輕量 getActivityGalleryBySlugDb 單一查詢取得。輸出不變、渲染大幅變快。
 *
 * 註：fixtures 為 .ts，bare `node --test` 不轉譯 → runtime 不可用（與 issue502／
 * issue1444 同，採 source-contract 鎖原始碼結構）；空輸入行為可直接實測。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getActivityGalleryBySlugDb } from '../../src/lib/db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..', '..');
const PAGE = readFileSync(join(APP_ROOT, 'app/page.tsx'), 'utf8');
const DB_MJS = readFileSync(join(APP_ROOT, 'src/lib/db.mjs'), 'utf8');

test('getActivityGalleryBySlugDb：空 slug / 查無 → 空陣列（不丟錯）', async () => {
  assert.deepEqual(await getActivityGalleryBySlugDb(''), []);
  assert.deepEqual(await getActivityGalleryBySlugDb(null), []);
  assert.deepEqual(await getActivityGalleryBySlugDb('no-such-activity-xyz'), []);
});

test('getActivityGalleryBySlugDb：只查 image_urls 單欄、限 published、有 in-memory fallback', () => {
  const idx = DB_MJS.indexOf('export async function getActivityGalleryBySlugDb');
  assert.ok(idx >= 0, '需有 getActivityGalleryBySlugDb gateway');
  const next = DB_MJS.indexOf('\nexport ', idx + 1);
  const fn = DB_MJS.slice(idx, next === -1 ? undefined : next);
  assert.match(fn, /\.select\(['"]image_urls['"]\)/, '只選 image_urls 單欄（輕量）');
  assert.match(fn, /\.eq\(['"]status['"],\s*['"]published['"]\)/, '限已發布行程');
  assert.match(fn, /!hasSupabaseEnv\(\)/, '需有 in-memory fallback 分支');
  // 不得連帶撈詳情用的關聯表
  assert.doesNotMatch(fn, /activity_schedules|activity_reviews|guide_profiles/, '不應撈 schedules/reviews/guide');
});

test('首頁不再於 critical path 呼叫重量級 getActivityBySlugDb', () => {
  assert.doesNotMatch(PAGE, /getActivityBySlugDb\(/, '首頁不應再呼叫 getActivityBySlugDb');
  assert.doesNotMatch(PAGE, /import[\s\S]*getActivityBySlugDb[\s\S]*from/, '首頁不應再 import getActivityBySlugDb');
  assert.match(PAGE, /getActivityGalleryBySlugDb\(/, '改用輕量相片查詢');
  // 評分改用 catalog 的 editorPick.activity（不再從 full 詳情）
  assert.match(PAGE, /resolveActivityReviewStats\(editorPick\.activity\)/, '評分需直接用 catalog row 計算');
});

test('首頁 revalidate 採長安全網（on-demand 為主），非短 timer 冷重生', () => {
  const m = PAGE.match(/export const revalidate\s*=\s*(\d+)/);
  assert.ok(m, '首頁需顯式設定 revalidate');
  assert.ok(Number(m[1]) >= 3600, `revalidate 應為長安全網（>=3600s），實際 ${m[1]}`);
});

test('admin 儲存首頁精選的 PUT 會 revalidatePath(\'/\')（儲存即時反映的關鍵接線）', () => {
  const route = readFileSync(join(APP_ROOT, 'app/api/admin/homepage-featured/route.ts'), 'utf8');
  const putIdx = route.indexOf('export async function PUT');
  assert.ok(putIdx >= 0, '需有 PUT handler');
  const putBody = route.slice(putIdx);
  assert.match(putBody, /revalidatePath\(['"]\/['"]\)/, 'PUT 寫入後需 revalidatePath(\'/\') 讓首頁即時重生');
  // 必須在寫入（setHomepageFeaturedDb）之後才 revalidate
  assert.ok(
    putBody.indexOf('setHomepageFeaturedDb') < putBody.indexOf("revalidatePath('/')"),
    'revalidatePath 應在資料寫入後呼叫',
  );
});
