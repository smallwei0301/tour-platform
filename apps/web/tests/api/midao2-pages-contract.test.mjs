import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao2 首頁：summary 串接＋統計卡導轉＋複製回覆', async () => {
  const src = await read('app/(non-locale)/midao2/page.tsx');
  assert.match(src, /\/api\/v2\/guide\/midao\/summary/);
  assert.match(src, /status=new/);
  assert.match(src, /status=pending_reply/);
  assert.match(src, /buildLineReplyText/);
  assert.match(src, /midao2-top-view/);
  assert.match(src, /midao2-share-cta/);
});

test('midao2 需求列表：tab 對映＋排序＋卡片導轉', async () => {
  const src = await read('app/(non-locale)/midao2/requests/page.tsx');
  assert.match(src, /\/api\/v2\/guide\/midao\/requests\?status=/);
  for (const s of ['all', 'new', 'pending_reply', 'replied', 'closed']) assert.match(src, new RegExp(`['"]${s}['"]`));
  assert.match(src, /unreplied_first/);
  assert.match(src, /tabCounts/);
  assert.match(src, /midao2-req-sort/);
  assert.match(src, /VALID_STATUSES|includes\(rawStatus/);
});

test('midao2 需求詳情：自動轉待回覆＋radio 三態＋複製回覆帶轉確認中', async () => {
  const src = await read('app/(non-locale)/midao2/requests/[id]/page.tsx');
  assert.match(src, /pending_reply/);
  assert.match(src, /buildRequestSummaryText/);
  assert.match(src, /buildLineReplyText/);
  assert.match(src, /line\.me\/R\/ti\/p\/~/);
  for (const v of ['replied', 'closed_won', 'closed_done']) assert.match(src, new RegExp(`midao2-status-${v}`));
  assert.match(src, /midao2-detail-copy-reply/);
});

test('midao2 行事曆：月格/點色/三格開關/週預設 modal', async () => {
  const src = await read('app/(non-locale)/midao2/calendar/page.tsx');
  assert.match(src, /\/api\/v2\/guide\/midao\/calendar\?month=/);
  assert.match(src, /buildMonthGrid/);
  assert.match(src, /hasPending/); assert.match(src, /hasConfirmed/);
  assert.match(src, /availability\/days\//);
  assert.match(src, /midao2-cal-period-/);
  const modal = await read('app/(non-locale)/midao2/calendar/WeeklyDefaultsModal.tsx');
  assert.match(modal, /availability\/defaults/);
  assert.match(modal, /\[1, 2, 3, 4, 5, 6, 0\]/); // 一→日顯示序對映 weekday 0=Sun
  assert.match(modal, /ResponsiveModal/);
});

test('midao2 服務列表＋精靈：三步/成交方式/上傳與送審串接', async () => {
  const list = await read('app/(non-locale)/midao2/services/page.tsx');
  assert.match(list, /\/api\/v2\/guide\/midao\/services/);
  assert.match(list, /showcasePublished/);
  assert.match(list, /midao2-svc-cover-error/);
  const form = await read('app/(non-locale)/midao2/services/ServiceForm.tsx');
  for (const m of ['instant_booking', 'confirm_first', 'line_inquiry']) assert.match(form, new RegExp(m));
  assert.match(form, /maxLength=\{?60\}?/);
  assert.match(form, /midao2-form-publish/);
  assert.match(form, /midao2-form-save-edit/);
});

test('midao2 服務編輯：上下架 toggle＋發佈到祕島', async () => {
  const edit = await read('app/(non-locale)/midao2/services/[id]/edit/page.tsx');
  assert.match(edit, /midaoStatus/);
  assert.match(edit, /\/api\/guide\/activities\/.*submit|submit.*activities/s);
  assert.match(edit, /midao2-edit-toggle/);
  const create = await read('app/(non-locale)/midao2/services/new/page.tsx');
  assert.match(create, /compressImage|upload-image/);
});

test('midao2 我的頁面：profile/公開預覽/QR/登出＋profile-extras route', async () => {
  const me = await read('app/(non-locale)/midao2/me/page.tsx');
  assert.match(me, /\/api\/guide\/profile/);
  assert.match(me, /QRCodeSVG/);
  assert.match(me, /\/api\/v2\/guide\/midao\/profile-extras/);
  assert.match(me, /midao2-me-classic/);
  assert.match(me, /midao2-me-logout/);
  const route = await read('app/api/v2/guide/midao/profile-extras/route.ts');
  assert.match(route, /validateCsrf/);
  assert.match(route, /updateGuideExperienceYearsDb/);
  assert.match(route, /export\s+async\s+function\s+GET/);
  assert.match(route, /getGuideExperienceYearsDb/);
});

test('公開接案頁：RSC 直呼領域檔＋表單 honeypot/聯絡驗證/成功畫面', async () => {
  const page = await read('app/(non-locale)/g/[slug]/page.tsx');
  assert.match(page, /getPublicMidaoPageDb/);
  assert.match(page, /generateMetadata/);
  assert.match(page, /notFound\(\)/);
  const form = await read('app/(non-locale)/g/[slug]/RequestForm.tsx');
  assert.match(form, /website/);
  assert.match(form, /openPeriods/);
  assert.match(form, /requestNo/);
  assert.match(form, /g-submit/);
  assert.doesNotMatch(form, /csrfHeaders/); // 公開端無 CSRF
});

test('登入動線：next 白名單含 /midao2、預設導 /midao2、舊後台互連', async () => {
  const login = await read('app/(non-locale)/guide/login/page.tsx');
  assert.match(login, /\/midao2/);
  assert.match(login, /startsWith\('\/midao2\/'\)/);
  const layout = await read('app/(non-locale)/guide/layout.tsx');
  assert.match(layout, /midao2 後台/);
});
