/**
 * 旅客後台（/me）「問答回覆」與「我的最愛」連到行程詳情頁時，必須直接組出
 * canonical 路徑 /activities/<region>/<slug>。少了 region 的 /activities/<slug>
 * 會先打到 [region] 相容頁，做一次 slug→activity 查詢後 302 轉址到 canonical，
 * 每次點擊都多一個 server round-trip + DB 查詢 —— 這是「從後台點行程載入過久，
 * 從行程列表點則正常」的根因（列表頁早就用 buildActivityHref 直連 canonical）。
 *
 * 鎖住 gateway 端有把 region/region_slug 一併取出並透傳，連結端才有資料可組。
 * Source-contract（Supabase 分支無法在無 DB 環境實跑）。純函式 mapMyQaRows 的
 * 行為由 tests/unit/issue-my-qa-mapper.test.mjs 實測覆蓋。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..', '..');
const DB_MJS = readFileSync(join(APP_ROOT, 'src/lib/db.mjs'), 'utf8')
  + readFileSync(join(APP_ROOT, 'src/lib/db-wishlist.mjs'), 'utf8'); // #1613：wishlist 已拆出，contract 掃兩檔
const MY_QA = readFileSync(join(APP_ROOT, 'src/lib/my-qa.mjs'), 'utf8');
const WISHLIST_PAGE = readFileSync(join(APP_ROOT, 'app/(non-locale)/me/wishlist/page.tsx'), 'utf8');

function sliceFn(src, name) {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `找不到 ${name}`);
  const next = src.indexOf('\nexport async function ', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

test('listMyQaDb：activities 查詢需取出 region 與 region_slug', () => {
  const fn = sliceFn(DB_MJS, 'listMyQaDb');
  const selects = fn.match(/\.select\('id, title, slug[^']*'\)/g) || [];
  assert.ok(selects.length >= 2, '應有 id-based 與 slug-based 兩個 activities 查詢');
  for (const s of selects) {
    assert.match(s, /region/, `activities select 需含 region：${s}`);
    assert.match(s, /region_slug/, `activities select 需含 region_slug：${s}`);
  }
});

test('listWishlistDb：activities 查詢取出 region 並於回傳透傳 region/regionSlug', () => {
  const fn = sliceFn(DB_MJS, 'listWishlistDb');
  const selects = fn.match(/\.select\('id, title, slug[^']*'\)/g) || [];
  assert.ok(selects.length >= 2, '應有 id-based 與 slug-based 兩個 activities 查詢');
  for (const s of selects) {
    assert.match(s, /region, region_slug/, `wishlist activities select 需含 region, region_slug：${s}`);
  }
  assert.match(fn, /region:\s*activity\?\.region/, '回傳需帶 region');
  assert.match(fn, /regionSlug:\s*activity\?\.region_slug/, '回傳需帶 regionSlug');
});

test('mapMyQaRows：行程連結用 resolveActivityRegionSegment 組 canonical 路徑（不得 region-less）', () => {
  assert.match(MY_QA, /resolveActivityRegionSegment/, '需用 region-slug 的單一真相 helper');
  assert.match(
    MY_QA,
    /\/activities\/\$\{encodeURIComponent\(resolveActivityRegionSegment\(activity\)\)\}\/\$\{encodeURIComponent\(activity\.slug\)\}/,
    '行程 targetHref 需為 /activities/<region>/<slug>',
  );
  assert.doesNotMatch(MY_QA, /`\/activities\/\$\{activity\.slug\}`/, '不得保留 region-less 連結');
});

test('我的最愛頁：行程連結用 buildActivityHref（canonical），不得 region-less', () => {
  assert.match(WISHLIST_PAGE, /import\s*\{\s*buildActivityHref\s*\}/, '需 import buildActivityHref');
  assert.match(WISHLIST_PAGE, /href=\{buildActivityHref\(\{\s*slug:\s*item\.slug/, '連結需用 buildActivityHref');
  assert.doesNotMatch(WISHLIST_PAGE, /href=\{`\/activities\/\$\{item\.slug\}`\}/, '不得保留 region-less 連結');
});
