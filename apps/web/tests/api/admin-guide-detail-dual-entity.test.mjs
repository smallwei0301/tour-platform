/**
 * Admin 導遊詳情「找不到導遊資料」— 雙實體 resolver 修復。
 *
 * 事故：admin 在「導遊申請」tab 點申請者名字 → 詳情頁顯示「找不到導遊
 * 資料」。根因是 ID 空間錯置：申請卡連結帶的是 guide_applications.id，
 * 但詳情 API 只查 guide_profiles（兩個實體、兩個 id 空間；promote 以
 * slug 關聯建檔，profile.id ≠ application.id 永遠成立）。因此任何狀態
 * 的申請（pending/approved/rejected、甚至已上線）點名字都 404。
 *
 * 系統性修法：/api/admin/guides/[guideId] 成為雙實體 resolver —
 *   1. 先查 guide_profiles.id → 命中回 kind:'profile'（欄位向後相容）。
 *   2. miss 再查 guide_applications.id → 命中回 kind:'application' 與
 *      申請資料（full_name/phone/email/city/bio/status/created_at）。
 *   3. 都沒有 → 404，錯誤訊息精準指出兩個來源都查過。
 * 前端詳情頁依 kind 渲染「申請詳情」或「導遊檔案」視圖。
 *
 * 同流程連帶地雷：promote route 對 guide_applications select 了
 * canonical schema 不存在的 name/slug 欄位（schema 只有 full_name、無
 * slug），對正式資料庫永遠報「申請資料不存在」。一併鎖修。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DETAIL_ROUTE = join(REPO_ROOT, 'app/api/admin/guides/[guideId]/route.ts');
const DETAIL_PAGE = join(REPO_ROOT, 'app/admin/guides/[guideId]/page.tsx');
const PROMOTE_ROUTE = join(REPO_ROOT, 'app/api/admin/guides/promote/route.ts');

// ---------- 詳情 API：雙實體 resolver ----------

test('詳情 API：查 guide_profiles miss 後 fallback 查 guide_applications', () => {
  const src = readFileSync(DETAIL_ROUTE, 'utf8');
  assert.match(src, /from\(\s*['"]guide_profiles['"]\s*\)/, '仍須先查 guide_profiles');
  assert.match(src, /from\(\s*['"]guide_applications['"]\s*\)/, 'miss 時必須查 guide_applications');
  const profileIdx = src.indexOf("'guide_profiles'");
  const applicationIdx = src.indexOf("'guide_applications'");
  assert.ok(profileIdx > 0 && applicationIdx > profileIdx, 'profiles 優先、applications 為 fallback');
});

test('詳情 API：application fallback 用 canonical 欄位（full_name 等，無 name/slug）', () => {
  const src = readFileSync(DETAIL_ROUTE, 'utf8');
  // select 以 appBaseSelect / appRichSelect 變數組裝（含 drift guard）。
  const baseDef = src.match(/appBaseSelect\s*=\s*['"`]([^'"`]+)['"`]/);
  assert.ok(baseDef, 'guide_applications 查詢必須有明確 base select 定義');
  for (const col of ['full_name', 'phone', 'email', 'city', 'bio', 'status', 'created_at']) {
    assert.match(baseDef[1], new RegExp(`\\b${col}\\b`), `application select 必須含 ${col}`);
  }
  assert.doesNotMatch(baseDef[1], /(^|,\s*)name(\s*,|$)/, 'name 欄位不存在於 schema');
  assert.doesNotMatch(baseDef[1], /\bslug\b/, 'slug 欄位不存在於 guide_applications schema');
});

test('詳情 API：回應帶 kind 區分 profile / application', () => {
  const src = readFileSync(DETAIL_ROUTE, 'utf8');
  assert.match(src, /kind:\s*['"]profile['"]/, 'profile 命中需標 kind:profile');
  assert.match(src, /kind:\s*['"]application['"]/, 'application 命中需標 kind:application');
});

test('詳情 API：雙來源都 miss 才 404，且訊息說明已查過申請資料', () => {
  const src = readFileSync(DETAIL_ROUTE, 'utf8');
  assert.match(src, /找不到導遊資料/);
  assert.match(src, /申請/, '404 訊息需讓管理員知道申請資料也查過了');
});

// ---------- 詳情頁：application 視圖 ----------

test('詳情頁：依 kind 渲染申請詳情視圖（含審核階段說明）', () => {
  const src = readFileSync(DETAIL_PAGE, 'utf8');
  assert.match(src, /kind\s*===\s*['"]application['"]/, '頁面必須分支處理 application');
  assert.match(src, /尚未建立正式導遊檔案/, '需向管理員說明此為申請審核階段');
});

// ---------- promote route：canonical schema 對齊 ----------

test('promote route：不得對 guide_applications select 不存在的 name/slug 欄位', () => {
  const src = readFileSync(PROMOTE_ROUTE, 'utf8');
  const baseDef = src.match(/appBaseSelect\s*=\s*['"`]([^'"`]+)['"`]/);
  assert.ok(baseDef, 'promote 必須有明確 base select 定義');
  assert.match(baseDef[1], /\bfull_name\b/, '必須用 canonical 的 full_name');
  assert.doesNotMatch(baseDef[1], /(^|,\s*)name(\s*,|$)/, 'name 欄位不存在於 schema');
  assert.doesNotMatch(baseDef[1], /\bslug\b/, 'slug 欄位不存在於 guide_applications schema');
});

test('promote route：profile slug 由申請 id 決定性導出（可重複 promote 冪等）', () => {
  const src = readFileSync(PROMOTE_ROUTE, 'utf8');
  assert.match(src, /deriveApplicationGuideSlug|guide-\$\{/, 'slug 必須由 application 決定性導出');
});
