/**
 * 導遊申請 → admin 詳情 → 上線建檔 → 導遊後台/旅客端 資料串接。
 *
 * 現況斷層：
 *   1. 申請表單收了 specialties/languages/regions/certs，但
 *      createGuideApplicationDb 全部丟掉（guide_applications 無欄位）。
 *   2. admin 申請詳情因此顯示不出專長/語言/地區/證照。
 *   3. promote（上線）只帶姓名建檔 — bio/城市/專長/語言不會自動帶到
 *      guide_profiles，旅客端導遊頁幾乎全空。
 *   4. 表單的「證件/照片上傳」是假欄位（submit 沒送）。
 *
 * 修法（文字資料全串通）：
 *   - migration：guide_applications + specialties/languages/regions/
 *     certifications(jsonb) + payment_method(text)。
 *   - create/list gateway 與 admin 詳情 API 持久化並回傳新欄位
 *     （含 schema drift guard：production 未跑 migration 時退回舊欄位）。
 *   - promote 建檔自動帶 bio/region(city)/languages/specialties；
 *     已存在 profile 不覆寫（避免蓋掉導遊自己編輯的資料）。
 *   - 申請表單第 2 步改為誠實說明（證件審核核驗、照片上線後於
 *     導遊後台上傳）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGuideApplicationDb, listGuideApplicationsDb } from '../../src/lib/db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..', '..');
const REPO_ROOT = join(APP_ROOT, '..', '..');
const DB_MJS = join(APP_ROOT, 'src/lib/db.mjs');
const PROMOTE_ROUTE = join(APP_ROOT, 'app/api/admin/guides/promote/route.ts');
const DETAIL_ROUTE = join(APP_ROOT, 'app/api/admin/guides/[guideId]/route.ts');
const DETAIL_PAGE = join(APP_ROOT, 'app/admin/guides/[guideId]/page.tsx');
const APPLY_PAGE = join(APP_ROOT, 'app/guide/apply/page.tsx');
const MIGRATION = join(REPO_ROOT, 'supabase/migrations/20260610_guide_applications_profile_fields.sql');

const SAMPLE = {
  fullName: '測試導遊',
  phone: '0912-000-111',
  email: `apply-${Date.now()}@example.com`,
  city: '高雄市',
  bio: '十年柴山生態導覽經驗。',
  specialties: ['生態導覽', '登山健行'],
  languages: ['中文', '英文'],
  regions: ['高雄', '屏東'],
  certs: ['急救證照', '導遊證'],
  payment: 'bank',
};

// ---------- 行為（in-memory fallback）----------

test('createGuideApplicationDb 持久化專長/語言/地區/證照/收款方式', async () => {
  const created = await createGuideApplicationDb(SAMPLE);
  assert.deepEqual(created.specialties, SAMPLE.specialties);
  assert.deepEqual(created.languages, SAMPLE.languages);
  assert.deepEqual(created.regions, SAMPLE.regions);
  assert.deepEqual(created.certifications, SAMPLE.certs);
  assert.equal(created.paymentMethod, 'bank');

  const list = await listGuideApplicationsDb({});
  const found = list.find((r) => r.id === created.id);
  assert.ok(found, '列表必須能查回該筆申請');
  assert.deepEqual(found.specialties, SAMPLE.specialties, '列表回傳需含專長');
});

test('createGuideApplicationDb：未提供陣列欄位時安全預設為空陣列', async () => {
  const created = await createGuideApplicationDb({
    ...SAMPLE,
    email: `apply-min-${Date.now()}@example.com`,
    specialties: undefined, languages: undefined, regions: undefined, certs: undefined, payment: undefined,
  });
  assert.deepEqual(created.specialties, []);
  assert.deepEqual(created.languages, []);
  assert.deepEqual(created.regions, []);
  assert.deepEqual(created.certifications, []);
});

// ---------- migration ----------

test('migration：guide_applications 新欄位（含 rollback）存在', () => {
  assert.ok(existsSync(MIGRATION), '需有 20260610_guide_applications_profile_fields.sql');
  const sql = readFileSync(MIGRATION, 'utf8');
  for (const col of ['specialties', 'languages', 'regions', 'certifications', 'payment_method']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`), `migration 需新增 ${col}`);
  }
  assert.ok(
    existsSync(MIGRATION.replace(/\.sql$/, '.rollback.sql')),
    '需提供 rollback 檔',
  );
});

// ---------- gateway drift guard ----------

test('db.mjs：supabase insert/select 帶新欄位且具 schema drift guard', () => {
  const src = readFileSync(DB_MJS, 'utf8');
  assert.match(src, /specialties:\s*JSON|specialties,?\s*\n?\s*languages/s, 'insert payload 需含新欄位');
  assert.match(src, /column .*does not exist|42703/, '需有欄位不存在的 drift guard（production 未跑 migration 時退回舊欄位）');
});

// ---------- admin 詳情 ----------

test('admin 詳情 API：application select 含新欄位（含 drift guard）', () => {
  const src = readFileSync(DETAIL_ROUTE, 'utf8');
  assert.match(src, /specialties, languages, regions, certifications, payment_method/, 'rich select 需含全部新欄位');
  assert.match(src, /column .*does not exist|42703/, '需有 drift guard');
  for (const field of ['specialties:', 'languages:', 'regions:', 'certifications:']) {
    assert.ok(src.includes(field), `回應 payload 需含 ${field}`);
  }
});

test('admin 詳情頁：渲染專長/語言/服務地區/證照', () => {
  const src = readFileSync(DETAIL_PAGE, 'utf8');
  for (const label of ['專長', '語言', '服務地區', '證照']) {
    assert.match(src, new RegExp(label), `申請詳情視圖需顯示 ${label}`);
  }
});

// ---------- promote 自動建檔 ----------

test('promote：建檔帶 bio/region/languages/specialties（不再只有姓名）', () => {
  const src = readFileSync(PROMOTE_ROUTE, 'utf8');
  const insert = src.match(/\.insert\(\{([\s\S]*?)\}\)/);
  assert.ok(insert, 'promote 需有 guide_profiles insert');
  for (const field of ['bio', 'region', 'languages', 'specialties']) {
    assert.match(insert[1], new RegExp(`\\b${field}\\b`), `建檔需帶 ${field}`);
  }
});

test('promote：已存在 profile 時不覆寫導遊自編資料（僅更新 verification_status）', () => {
  const src = readFileSync(PROMOTE_ROUTE, 'utf8');
  const existingBranch = src.match(/if \(existing\) \{([\s\S]*?)\} else \{/);
  assert.ok(existingBranch);
  assert.doesNotMatch(existingBranch[1], /\bbio\b|\bspecialties\b/, '已存在 profile 不得覆寫 bio/specialties');
});

// ---------- 申請表單誠實化 ----------

test('申請表單：移除假檔案上傳欄位，改為誠實流程說明', () => {
  const src = readFileSync(APPLY_PAGE, 'utf8');
  assert.doesNotMatch(src, /type="file"/, '送不出去的 file input 必須移除');
  assert.match(src, /審核|核驗/, '需說明證件核驗流程');
  assert.match(src, /導遊後台/, '需說明照片於上線後在導遊後台上傳');
});
