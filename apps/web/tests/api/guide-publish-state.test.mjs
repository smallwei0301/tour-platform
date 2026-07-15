/**
 * 導遊自主發佈（is_published）+ on-demand revalidation。
 *
 * 需求：
 *   1. 導遊在後台公開頁編輯、調整完成後按「儲存並公開」才上架；
 *      promote 上線時預設不公開（is_published=false）。
 *   2. 認識導遊列表只顯示已發佈導遊（listPublishedGuidesDb 加
 *      is_published 過濾，含 schema drift guard）。
 *   3. 導遊存檔／發佈成功 → revalidatePath('/guides') 精準失效，旅客
 *      刷新即見最新資料；不再用定時 ISR（移除 export const revalidate）。
 *   4. 首次以驗證碼登入 → 導向 /guide/profile 先調整資料。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..', '..');
const REPO_ROOT = join(APP_ROOT, '..', '..');
const DB_MJS = join(APP_ROOT, 'src/lib/db.mjs');
const PROFILE_ROUTE = join(APP_ROOT, 'app/api/guide/profile/route.ts');
const PROFILE_PAGE = join(APP_ROOT, 'app/(non-locale)/guide/profile/page.tsx');
const LOGIN_PAGE = join(APP_ROOT, 'app/(non-locale)/guide/login/page.tsx');
const PROMOTE_ROUTE = join(APP_ROOT, 'app/api/admin/guides/promote/route.ts');
const LIST_PAGE = join(APP_ROOT, 'app/[locale]/guides/page.tsx');
const DETAIL_PAGE = join(APP_ROOT, 'app/[locale]/guides/[slug]/page.tsx');
const MIGRATION = join(REPO_ROOT, 'supabase/migrations/20260611_guide_profiles_is_published.sql');

// ---------- migration ----------

test('migration：guide_profiles 新增 is_published（含回填與 rollback）', () => {
  assert.ok(existsSync(MIGRATION), '需有 20260611_guide_profiles_is_published.sql');
  const sql = readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS is_published boolean/, '需新增 is_published 欄位');
  assert.match(sql, /DEFAULT false/, '預設不公開');
  assert.match(sql, /UPDATE public\.guide_profiles[\s\S]*is_published = true[\s\S]*approved/, '需回填現有 approved 導遊為已發佈');
  assert.ok(existsSync(MIGRATION.replace(/\.sql$/, '.rollback.sql')), '需提供 rollback 檔');
});

// ---------- listPublishedGuidesDb 過濾 ----------

test('listPublishedGuidesDb：只取 is_published=true（含 drift guard）', () => {
  const src = readFileSync(DB_MJS, 'utf8');
  const fn = src.slice(src.indexOf('export async function listPublishedGuidesDb'));
  const body = fn.slice(0, fn.indexOf('export async function', 1));
  assert.match(body, /\.eq\(\s*['"]is_published['"]\s*,\s*true\s*\)/, '需過濾 is_published=true');
  assert.match(body, /42703|column .*does not exist/, '需 schema drift guard（migration 未跑時退回舊行為，不可整批隱藏）');
});

// ---------- guide profile GET/PATCH ----------

test('profile API：GET 回傳 is_published、PATCH 接受 is_published', () => {
  const src = readFileSync(PROFILE_ROUTE, 'utf8');
  assert.match(src, /EDITABLE_FIELDS[\s\S]*['"]is_published['"]/, 'is_published 必須在可編輯白名單');
  assert.match(src, /is_published/, 'GET 回傳需含 is_published');
});

test('profile API：存檔成功後 on-demand 失效 /guides（含各 locale，#1488）', () => {
  const src = readFileSync(PROFILE_ROUTE, 'utf8');
  assert.match(src, /from\s+['"]next\/cache['"]/, '需 import next/cache');
  // #1488：/guides 在 app/[locale]/，需以 localizeRevalidationPaths 展開各 locale 前綴。
  assert.match(src, /localizeRevalidationPaths/, '需以 localizeRevalidationPaths 展開各 locale');
  assert.match(src, /['"]\/guides['"]/, '需失效 /guides');
  assert.match(src, /[`'"]\/guides\/\$\{?/, '需一併失效該導遊詳情頁 /guides/<slug>');
  assert.match(src, /revalidatePath\(p\)/, '需對每個 locale 版本 revalidatePath');
});

// ---------- profile 頁面：發佈開關 + 引導 ----------

test('profile 頁：有發佈開關（儲存並公開／取消公開）並送出 is_published', () => {
  const src = readFileSync(PROFILE_PAGE, 'utf8');
  assert.match(src, /is_published/, '頁面狀態需含 is_published');
  assert.match(src, /儲存並公開/, '需「儲存並公開」動作');
  assert.match(src, /取消公開|將下架|取消發佈/, '已公開時需可取消公開');
  assert.match(src, /is_published:\s*\w/, 'PATCH payload 需帶 is_published');
});

test('profile 頁：未公開時提示尚未公開（引導導遊發佈）', () => {
  const src = readFileSync(PROFILE_PAGE, 'utf8');
  assert.match(src, /尚未公開|未公開|還沒公開/, '未公開狀態需明確提示');
});

// ---------- 首次登入導向 ----------

test('login 頁：首次（驗證碼）登入導向 /guide/profile 先調整資料', () => {
  const src = readFileSync(LOGIN_PAGE, 'utf8');
  assert.match(src, /isFirstTime\s*\?\s*['"]\/guide\/profile['"]|['"]\/guide\/profile['"]\s*:\s*safeNext/, '首次登入需導向 /guide/profile');
});

// ---------- promote 預設不公開 ----------

test('promote：新建導遊檔案預設 is_published=false（建檔但不公開）', () => {
  const src = readFileSync(PROMOTE_ROUTE, 'utf8');
  // promote 以 newProfilePayload 變數組裝 insert（含 schema drift guard）。
  const payload = src.match(/newProfilePayload[^=]*=\s*\{([\s\S]*?)\};/);
  assert.ok(payload, 'promote 需有 guide_profiles insert payload');
  assert.match(payload[1], /is_published:\s*false/, '上線建檔需預設未公開');
});

// ---------- 移除定時 ISR（改 on-demand）----------

test('/guides 與 /guides/[slug]：不再用定時 ISR revalidate（改 on-demand）', () => {
  const list = readFileSync(LIST_PAGE, 'utf8');
  const detail = readFileSync(DETAIL_PAGE, 'utf8');
  assert.doesNotMatch(list, /export const revalidate\s*=\s*\d/, '列表頁不應再有定時 revalidate');
  assert.doesNotMatch(detail, /export const revalidate\s*=\s*\d/, '詳情頁不應再有定時 revalidate');
});
