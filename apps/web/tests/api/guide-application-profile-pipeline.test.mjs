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
  // 單一 payment 字串向後相容：paymentMethods 推為單元素陣列。
  assert.deepEqual(created.paymentMethods, ['bank']);

  const list = await listGuideApplicationsDb({});
  const found = list.find((r) => r.id === created.id);
  assert.ok(found, '列表必須能查回該筆申請');
  assert.deepEqual(found.specialties, SAMPLE.specialties, '列表回傳需含專長');
});

test('createGuideApplicationDb：收款方式可複選（payments 陣列）', async () => {
  const created = await createGuideApplicationDb({
    ...SAMPLE,
    email: `apply-multi-${Date.now()}@example.com`,
    payments: ['bank', 'linepay'],
  });
  assert.deepEqual(created.paymentMethods, ['bank', 'linepay']);
  assert.equal(created.paymentMethod, 'bank', '單選欄位向後相容＝首個選項');
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

test('admin 詳情頁：渲染專長/語言/熟悉區域/證照/收款方式', () => {
  const src = readFileSync(DETAIL_PAGE, 'utf8');
  for (const label of ['專長', '語言', '熟悉區域', '證照', '收款方式']) {
    assert.match(src, new RegExp(label), `申請詳情視圖需顯示 ${label}`);
  }
  assert.doesNotMatch(src, /服務地區/, '服務地區應已改名為熟悉區域');
});

// ---------- promote 自動建檔 ----------

test('promote：建檔帶 bio/region/regions/languages/specialties/certifications/payment_methods', () => {
  const src = readFileSync(PROMOTE_ROUTE, 'utf8');
  // promote 以 newProfilePayload 變數組裝 insert（含 schema drift guard）。
  const payload = src.match(/newProfilePayload[^=]*=\s*\{([\s\S]*?)\};/);
  assert.ok(payload, 'promote 需有 guide_profiles insert payload');
  for (const field of ['bio', 'region', 'regions', 'languages', 'specialties', 'certifications', 'payment_methods']) {
    assert.match(payload[1], new RegExp(`\\b${field}\\b`), `建檔需帶 ${field}`);
  }
});

// ---------- 熟悉區域／證照／收款方式：profile 串接 + 公開頁 + 導遊可編輯 ----------

test('migration：guide_profiles 新增 regions/certifications/payment_methods（含 rollback）', () => {
  const file = join(REPO_ROOT, 'supabase/migrations/20260623000000_guide_profile_familiar_regions.sql');
  assert.ok(existsSync(file), '需有 20260623000000_guide_profile_familiar_regions.sql');
  const sql = readFileSync(file, 'utf8');
  for (const col of ['regions', 'certifications', 'payment_methods']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`), `migration 需新增 ${col}`);
  }
  assert.ok(existsSync(file.replace(/\.sql$/, '.rollback.sql')), '需提供 rollback 檔');
});

test('導遊後台 profile route：熟悉區域/證照/收款方式可編輯且具 drift guard', () => {
  const route = join(APP_ROOT, 'app/api/guide/profile/route.ts');
  const src = readFileSync(route, 'utf8');
  for (const field of ['regions', 'certifications', 'payment_methods']) {
    assert.match(src, new RegExp(`'${field}'`), `EDITABLE/select 需含 ${field}`);
  }
  assert.match(src, /column .*does not exist|42703/, '需有 schema drift guard');
});

test('公開導遊頁：顯示熟悉區域/專業證照/收款方式', () => {
  // #multilingual：公開頁已搬進 app/[locale]/，文案改用 guideProfile namespace 的 i18n key；
  // 頁面驗 t('<key>') 引用，繁中字面值改在 messages/zh-Hant.json catalog 斷言。
  const page = join(APP_ROOT, 'app/[locale]/guides/[slug]/page.tsx');
  const src = readFileSync(page, 'utf8');
  for (const key of ['regionsLabel', 'certificationsLabel', 'paymentMethodsLabel']) {
    assert.match(src, new RegExp(`t\\(['"]${key}['"]\\)`), `公開頁需以 t('${key}') 顯示`);
  }
  const zh = JSON.parse(readFileSync(join(APP_ROOT, 'messages/zh-Hant.json'), 'utf8')).guideProfile;
  for (const [key, label] of [['regionsLabel', '熟悉區域'], ['certificationsLabel', '專業證照'], ['paymentMethodsLabel', '收款方式']]) {
    assert.match(zh[key], new RegExp(label), `guideProfile.${key} 需為 ${label}`);
  }
  assert.match(src, /getGuideBySlugDb|guide\.regions|guideRegions/, '需綁定導遊資料');
});

test('getGuideBySlugDb：select 帶 regions/certifications/payment_methods 且具 drift guard', () => {
  const src = readFileSync(DB_MJS, 'utf8');
  assert.match(src, /regions, certifications, payment_methods/, 'guide 公開查詢需 select 新欄位');
});

test('promote：已存在 profile 時不覆寫導遊自編資料（僅更新 verification_status）', () => {
  const src = readFileSync(PROMOTE_ROUTE, 'utf8');
  const existingBranch = src.match(/if \(existing\) \{([\s\S]*?)\} else \{/);
  assert.ok(existingBranch);
  assert.doesNotMatch(existingBranch[1], /\bbio\b|\bspecialties\b/, '已存在 profile 不得覆寫 bio/specialties');
});

// ---------- 申請表單誠實化 ----------

test('申請表單：照片為真上傳（打 upload API），證件仍人工核驗', () => {
  const src = readFileSync(APPLY_PAGE, 'utf8');
  // 照片串接改版：file input 恢復且必須真的上傳（詳細契約見
  // guide-application-photos.test.mjs 與 issue1093 測試）。
  assert.match(src, /\/api\/guide-applications\/upload/, '照片必須經 upload API 真上傳');
  assert.match(src, /審核|核驗/, '需說明證件核驗流程');
  assert.match(src, /導遊後台/, '需說明上線後可於導遊後台管理照片');
});
