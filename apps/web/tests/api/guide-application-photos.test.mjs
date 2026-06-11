/**
 * 導遊申請照片串接：申請表單真上傳 → guide_applications 持久化 →
 * admin 申請詳情顯示 → promote 自動帶入 guide_profiles →
 * 導遊登入後台即有照片、認識導遊頁可見。
 *
 * 設計：
 *   - 申請者尚無 guide session，新增匿名上傳 API
 *     POST /api/guide-applications/upload（kind=avatar|hero|gallery），
 *     檔案存 `guides` bucket 的 applications/ 前綴，限型別/大小/頻率。
 *   - 個人照片為必填（表單 gating + API 驗證）；封面/活動照選填。
 *   - migration：guide_applications + profile_photo_url / hero_image_url /
 *     gallery_urls（與 guide_profiles 同名，promote 直接帶過去）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGuideApplicationDb } from '../../src/lib/db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..', '..');
const REPO_ROOT = join(APP_ROOT, '..', '..');
const DB_MJS = join(APP_ROOT, 'src/lib/db.mjs');
const UPLOAD_ROUTE = join(APP_ROOT, 'app/api/guide-applications/upload/route.ts');
const APPLICATIONS_ROUTE = join(APP_ROOT, 'app/api/guide-applications/route.ts');
const DETAIL_ROUTE = join(APP_ROOT, 'app/api/admin/guides/[guideId]/route.ts');
const DETAIL_PAGE = join(APP_ROOT, 'app/admin/guides/[guideId]/page.tsx');
const PROMOTE_ROUTE = join(APP_ROOT, 'app/api/admin/guides/promote/route.ts');
const APPLY_PAGE = join(APP_ROOT, 'app/guide/apply/page.tsx');
const MIGRATION = join(REPO_ROOT, 'supabase/migrations/20260611_guide_application_photos.sql');

const SAMPLE = {
  fullName: '照片測試導遊',
  phone: '0912-000-222',
  email: `apply-photo-${Date.now()}@example.com`,
  city: '台南市',
  bio: '在地巷弄美食與文史導覽。',
  profilePhotoUrl: 'https://cdn.example.com/guides/applications/x/avatar-1.jpg',
  heroImageUrl: 'https://cdn.example.com/guides/applications/x/hero-1.jpg',
  galleryUrls: [
    'https://cdn.example.com/guides/applications/x/gallery-1.jpg',
    'https://cdn.example.com/guides/applications/x/gallery-2.jpg',
  ],
};

// ---------- 行為（in-memory fallback）----------

test('createGuideApplicationDb 持久化個人照片/封面/活動照片', async () => {
  const created = await createGuideApplicationDb(SAMPLE);
  assert.equal(created.profilePhotoUrl, SAMPLE.profilePhotoUrl);
  assert.equal(created.heroImageUrl, SAMPLE.heroImageUrl);
  assert.deepEqual(created.galleryUrls, SAMPLE.galleryUrls);
});

test('createGuideApplicationDb：未提供照片時安全預設（null / 空陣列）', async () => {
  const created = await createGuideApplicationDb({
    ...SAMPLE,
    email: `apply-photo-min-${Date.now()}@example.com`,
    profilePhotoUrl: undefined,
    heroImageUrl: undefined,
    galleryUrls: undefined,
  });
  assert.equal(created.heroImageUrl ?? null, null);
  assert.deepEqual(created.galleryUrls, []);
});

// ---------- migration ----------

test('migration：guide_applications 照片欄位（含 rollback）存在', () => {
  assert.ok(existsSync(MIGRATION), '需有 20260611_guide_application_photos.sql');
  const sql = readFileSync(MIGRATION, 'utf8');
  for (const col of ['profile_photo_url', 'hero_image_url', 'gallery_urls']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`), `migration 需新增 ${col}`);
  }
  assert.ok(existsSync(MIGRATION.replace(/\.sql$/, '.rollback.sql')), '需提供 rollback 檔');
});

// ---------- gateway ----------

test('db.mjs：insert/select 帶照片欄位（rich path）', () => {
  const src = readFileSync(DB_MJS, 'utf8');
  assert.match(src, /profile_photo_url/, 'payload/select 需含 profile_photo_url');
  assert.match(src, /hero_image_url/, 'payload/select 需含 hero_image_url');
  assert.match(src, /gallery_urls/, 'payload/select 需含 gallery_urls');
});

// ---------- 匿名上傳 API ----------

test('上傳 API：存在且限制 kind / 型別 / 大小，路徑鎖 applications/ 前綴', () => {
  assert.ok(existsSync(UPLOAD_ROUTE), '需有 /api/guide-applications/upload route');
  const src = readFileSync(UPLOAD_ROUTE, 'utf8');
  for (const kind of ['avatar', 'hero', 'gallery']) {
    assert.match(src, new RegExp(kind), `需支援 kind=${kind}`);
  }
  assert.match(src, /image\/jpeg/, '需限制 MIME 型別');
  assert.match(src, /applications\//, '儲存路徑必須在 applications/ 前綴（與正式導遊資料隔離）');
  assert.match(src, /RateLimiter|rateLimit/i, '匿名端點必須限流');
  assert.match(src, /5 \* 1024 \* 1024/, '需有檔案大小上限');
});

test('申請 API：個人照片為必填（profilePhotoUrl 缺漏要 400）', () => {
  const src = readFileSync(APPLICATIONS_ROUTE, 'utf8');
  assert.match(src, /profilePhotoUrl/, 'POST 需驗證 profilePhotoUrl');
  assert.match(src, /required/, '缺漏需走 required → 400 路徑');
});

// ---------- admin 詳情 ----------

test('admin 詳情 API：application 回應含照片欄位', () => {
  const src = readFileSync(DETAIL_ROUTE, 'utf8');
  assert.match(src, /profile_photo_url, hero_image_url, gallery_urls/, 'rich select 需含照片欄位');
  for (const field of ['profilePhotoUrl:', 'heroImageUrl:', 'galleryUrls:']) {
    assert.ok(src.includes(field), `回應 payload 需含 ${field}`);
  }
});

test('admin 詳情頁：渲染申請者個人照片/封面/活動照片', () => {
  const src = readFileSync(DETAIL_PAGE, 'utf8');
  assert.match(src, /application-avatar/, '需有申請者頭像呈現');
  assert.match(src, /application-hero/, '需有封面呈現');
  assert.match(src, /application-gallery/, '需有活動照片呈現');
});

// ---------- promote 帶入 ----------

test('promote：建檔自動帶 profile_photo_url / hero_image_url / gallery_urls', () => {
  const src = readFileSync(PROMOTE_ROUTE, 'utf8');
  const insert = src.match(/\.insert\(\{([\s\S]*?)\}\)/);
  assert.ok(insert, 'promote 需有 guide_profiles insert');
  for (const field of ['profile_photo_url', 'hero_image_url', 'gallery_urls']) {
    assert.match(insert[1], new RegExp(field), `建檔需帶 ${field}`);
  }
});

// ---------- 申請表單 ----------

test('申請表單：真上傳（file input 有 accept 且打上傳 API），個人照片必填 gating', () => {
  const src = readFileSync(APPLY_PAGE, 'utf8');
  const fileInputs = src.match(/type="file"/g) || [];
  assert.ok(fileInputs.length >= 3, '需有個人照片/封面/活動照片三個上傳欄位');
  // accept 以 PHOTO_ACCEPT 常數綁定（GH-1093 契約回歸）
  assert.match(src, /PHOTO_ACCEPT\s*=\s*'image\/jpeg,image\/png,image\/webp'/, '需定義 image MIME accept 常數');
  const acceptBound = (src.match(/accept=\{PHOTO_ACCEPT\}/g) || []).length;
  assert.ok(acceptBound >= 3, '三個 file input 都需綁 accept');
  assert.match(src, /\/api\/guide-applications\/upload/, '必須真的打上傳 API（不得再有假欄位）');
  assert.match(src, /disabled=\{[^}]*!profilePhotoUrl/, '個人照片未上傳前不得進入下一步');
  for (const field of ['profilePhotoUrl', 'heroImageUrl', 'galleryUrls']) {
    assert.match(src, new RegExp(`${field}[,:]`), `submit payload 需含 ${field}`);
  }
  assert.match(src, /請勿在表單中提供證件影本/, '證件核驗誠實說明不得移除');
});
