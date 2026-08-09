/**
 * #1759 Package 4／Task 43b：旅客確認頁的 source-contract 測試。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-08-issue1759-task43-traveler-confirm-page-plan.md
 * §4.4（六態狀態機、accept 分支、metadata 拆層）／§6 卡 43b RED/GREEN。
 *
 * 為何存在：計畫 §6 允許在本機 Playwright 無法啟動（ENOSPC watcher 限制）時
 * 以 NOT_AUTOMATABLE_LOCAL_WATCHERS 回報，但**必須**改以 source-contract 形式
 * 鎖定頁面檔存在、testid 字面量齊全、fetch 路徑與 login next 形狀正確。
 * 本檔即該補償，與 e2e/midao-inquiry-conversion.spec.ts 的 T1–T9 語意對齊。
 *
 * 讀檔用 import.meta.url 定位，故 repo 根或 apps/web 執行皆可（避免 cwd 造成假性 ENOENT）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

const PAGE_REL = 'app/(non-locale)/booking/confirm/[token]/page.tsx';
const CLIENT_REL = 'app/(non-locale)/booking/confirm/[token]/BookingConfirmClient.tsx';
const CARD_REL = 'src/components/booking/BookingConfirmationCard.tsx';
const SPEC_REL = 'e2e/midao-inquiry-conversion.spec.ts';

function readSource(rel) {
  return readFileSync(path.join(WEB_ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// 1) 三個檔案存在，且 server／client 分層正確（計畫 §4.4 步驟 4）
// ---------------------------------------------------------------------------
test('page.tsx 是 server component：export metadata + force-dynamic，並 render client 元件', () => {
  const src = readSource(PAGE_REL);

  assert.doesNotMatch(src, /^'use client'/mu, "page.tsx 不得是 client component（'use client' 檔不能 export metadata）");
  assert.match(src, /export const metadata/u, 'page.tsx 必須 export metadata');
  assert.match(src, /referrer:\s*'no-referrer'/u, "metadata 必須設 referrer: 'no-referrer'（計畫 §2 D7 RISK-2 緩解）");
  assert.match(src, /export const dynamic\s*=\s*'force-dynamic'/u, "page.tsx 必須 export dynamic = 'force-dynamic'");
  assert.match(src, /BookingConfirmClient/u, 'page.tsx 必須 render BookingConfirmClient');
  // token 由 server 端 await params 取出後傳給 client，不得在 client 讀 useParams 以外的來源
  assert.match(src, /await params/u, 'page.tsx 必須 await params 取出 token');
});

test('BookingConfirmClient.tsx 是 client component，且不得 export metadata', () => {
  const src = readSource(CLIENT_REL);
  assert.match(src, /^'use client';/u, "BookingConfirmClient.tsx 必須以 'use client' 開頭");
  assert.doesNotMatch(src, /export const metadata/u, "'use client' 檔不得 export metadata");
});

test('BookingConfirmationCard.tsx 是純呈現元件：不得自行 fetch', () => {
  const src = readSource(CARD_REL);
  assert.doesNotMatch(src, /fetch\(/u, '卡片元件不得自行 fetch（計畫 §3.2）');
  assert.doesNotMatch(src, /useEffect/u, '卡片元件不得有副作用');
  // props 精確如計畫 §4.4 步驟 1
  for (const prop of ['preview', 'submitting', 'errorMessage', 'onAccept']) {
    assert.match(src, new RegExp(`\\b${prop}\\b`, 'u'), `卡片元件 props 必須含 ${prop}`);
  }
  // 不得 import server 檔（型別要前端複刻）。只看 import 語句，註解提及檔名不算違規。
  const importLines = src.split('\n').filter((line) => /^\s*import\b/u.test(line));
  for (const line of importLines) {
    assert.doesNotMatch(line, /booking-confirmation-preview/u, '卡片元件不得 import server 端純函式層');
    assert.doesNotMatch(line, /db-midao/u, '卡片元件不得 import gateway');
    assert.doesNotMatch(line, /supabase/u, '卡片元件不得 import supabase');
  }
});

// ---------------------------------------------------------------------------
// 2) 六態 data-testid 字面量齊全（計畫 §4.4 表格，不得增減）
// ---------------------------------------------------------------------------
const STATE_TESTIDS = [
  'booking-confirm-loading',
  'booking-confirm-login-required',
  'booking-confirm-invalid',
  'booking-confirm-expired',
  'booking-confirm-used',
];

test('六態 testid 在 client 元件齊全，卡片 testid 在卡片元件', () => {
  const clientSrc = readSource(CLIENT_REL);
  const cardSrc = readSource(CARD_REL);
  const combined = `${clientSrc}\n${cardSrc}`;

  for (const testid of STATE_TESTIDS) {
    assert.match(clientSrc, new RegExp(`data-testid="${testid}"`, 'u'), `缺少狀態 testid：${testid}`);
  }
  assert.match(combined, /data-testid="booking-confirm-card"/u, '缺少 ready 狀態 testid：booking-confirm-card');
  assert.match(combined, /data-testid="booking-confirm-accept"/u, '缺少確認鈕 testid：booking-confirm-accept');
});

test('五項顯示欄位各有專屬 testid（服務／日期／人數／價格／期限）', () => {
  const cardSrc = readSource(CARD_REL);
  for (const testid of [
    'booking-confirm-service',
    'booking-confirm-schedule',
    'booking-confirm-party-size',
    'booking-confirm-price',
    'booking-confirm-expires-at',
  ]) {
    assert.match(cardSrc, new RegExp(`data-testid="${testid}"`, 'u'), `缺少顯示欄位 testid：${testid}`);
  }
});

test('繁中文案語意齊全（六態）', () => {
  const clientSrc = readSource(CLIENT_REL);
  assert.match(clientSrc, /載入中/u);
  assert.match(clientSrc, /請先登入/u);
  assert.match(clientSrc, /無效/u);
  assert.match(clientSrc, /不屬於目前登入的帳號/u);
  assert.match(clientSrc, /已過期/u);
  assert.match(clientSrc, /已完成確認/u);
});

// ---------------------------------------------------------------------------
// 3) fetch 路徑、login next 形狀、accept 提交契約（計畫 §4.4 步驟 3）
// ---------------------------------------------------------------------------
test('GET preview 打正確路徑並帶 no-store 與 same-origin', () => {
  const src = readSource(CLIENT_REL);
  assert.match(
    src,
    /\/api\/v2\/me\/booking-confirmations\/\$\{encodeURIComponent\(token\)\}/u,
    'GET 必須打 /api/v2/me/booking-confirmations/<token>，token 需 encodeURIComponent',
  );
  assert.match(src, /cache:\s*'no-store'/u, 'preview 請求不得進快取層');
  assert.match(src, /credentials:\s*'same-origin'/u);
});

test('未登入導向使用 next= 慣例與 encodeURIComponent（計畫 §2 D7）', () => {
  const src = readSource(CLIENT_REL);
  assert.match(
    src,
    /`\/login\?next=\$\{encodeURIComponent\(`\/booking\/confirm\/\$\{token\}`\)\}`/u,
    "登入連結必須是 /login?next=${encodeURIComponent('/booking/confirm/' + token)}",
  );
  assert.doesNotMatch(src, /redirectTo=/u, '不得改用 redirectTo= 慣例');
});

test('accept 提交契約：CSRF、重用 idempotency-key、嚴格空物件 body', () => {
  const src = readSource(CLIENT_REL);

  assert.match(src, /ensureCsrfToken\(\)/u, 'accept 前必須 await ensureCsrfToken()');
  assert.match(src, /csrfHeaders\(/u, 'accept 必須帶 csrfHeaders()');
  assert.match(src, /'idempotency-key'/u, 'accept 必須帶 idempotency-key');
  // 鑰匙必須存進 ref 並重用；不得在送出時直接 randomUUID
  assert.match(src, /useRef<string \| null>\(null\)/u, 'idempotency-key 必須存進 useRef');
  assert.match(
    src,
    /idempotencyKeyRef\.current\s*\?\?=\s*crypto\.randomUUID\(\)/u,
    '同一頁面生命週期必須重放同一把 idempotency-key（?\?= 只在首次產生）',
  );
  assert.match(src, /body:\s*'\{\}'/u, "accept body 必須是嚴格空物件字串 '{}'");
  assert.match(src, /\/accept`/u, 'accept 必須打 .../accept');
});

test('accept 成功導向既有付款頁（計畫 §2 D8）', () => {
  const src = readSource(CLIENT_REL);
  assert.match(
    src,
    /router\.replace\(`\/order\/pay\?orderId=\$\{encodeURIComponent\(/u,
    "accept 200 必須 router.replace('/order/pay?orderId=' + encodeURIComponent(orderId))",
  );
});

test('accept 錯誤分支逐一對齊計畫 §4.4 步驟 3', () => {
  const src = readSource(CLIENT_REL);
  // TOCTOU：GET 是預測，accept 才是權威，故 accept 的 410/409 必須各自有分支
  assert.match(src, /CONFIRMATION_TOKEN_ALREADY_CONSUMED/u, '409 已消費必須切 used');
  assert.match(src, /CAPACITY_EXCEEDED/u, '409 名額已滿必須停在 ready');
  assert.match(src, /名額已滿/u, '名額已滿必須有繁中提示');
  assert.match(src, /IDEMPOTENCY_IN_PROGRESS/u, '409 處理中必須允許重試');
  assert.match(src, /處理中/u);
  assert.match(src, /=== 410|status === 410/u, '410 必須切 expired');
  assert.match(src, /服務暫時無法使用/u, '503 必須有繁中提示');
});

test('GET 503/5xx 保留 invalid testid，但不得把服務錯誤呈現為連結無效', () => {
  const src = readSource(CLIENT_REL);
  const invalidBlock = src.slice(src.indexOf("if (state === 'invalid')"), src.indexOf("if (state === 'expired')"));

  assert.match(
    src,
    /response\.status === 503 \? SERVICE_UNAVAILABLE_ERROR : GENERIC_ERROR/u,
    'GET 非 2xx／401／404 時，503 與其他 5xx 必須各自保留服務錯誤文案',
  );
  assert.match(
    invalidBlock,
    /errorMessage === SERVICE_UNAVAILABLE_ERROR \|\| errorMessage === GENERIC_ERROR/u,
    'invalid render 必須辨識服務錯誤，避免把 503/5xx 誤報為連結無效',
  );
  assert.match(
    invalidBlock,
    /\{isServiceIssue \? errorMessage : '此確認連結無效，或不屬於目前登入的帳號。'\}/u,
    '服務錯誤時必須以服務錯誤取代連結無效主文案，404 維持原文案',
  );
});

test('送出中必須停用確認鈕（避免重複送出，對齊 E2E T9）', () => {
  const cardSrc = readSource(CARD_REL);
  assert.match(cardSrc, /disabled=\{submitting\}/u, '確認鈕必須在 submitting 時 disabled');
});

// ---------------------------------------------------------------------------
// 4) 範圍護欄：不得碰 forbidden scope，且既有 E2E 測試維持不動
// ---------------------------------------------------------------------------
test('client 元件不得直接呼叫付款或 checkout API（付款凍結區）', () => {
  const src = readSource(CLIENT_REL);
  assert.doesNotMatch(src, /\/api\/v2\/payments/u);
  assert.doesNotMatch(src, /\/api\/payments/u);
  assert.doesNotMatch(src, /\/checkout/u);
});

test('既有 Task 42 E2E 案例（E1–E5 與 activityPlanId 為 null）仍在，且新區塊為 append', () => {
  const spec = readSource(SPEC_REL);
  const legacyTitles = [
    'E1: clipboard 不可用時 fallback 成唯讀文案與可用的 LINE 連結',
    'E2: 產生文案／複製／開 LINE 都不得呼叫 mark-replied',
    'E3: 轉單表單只送出白名單欄位並帶 CSRF 與 idempotency-key',
    'E4: created 顯示 confirmation URL；replayed 不得假造連結',
    'E5: 409 錯誤依 code 顯示繁中文案並保留表單值或提供重新載入',
    'activityPlanId 為 null 時停用整個轉單區塊',
  ];
  for (const title of legacyTitles) {
    assert.ok(spec.includes(title), `既有測試不得被移除：${title}`);
  }

  const describeIndex = spec.indexOf("test.describe('Task 43 traveler confirmation page'");
  assert.ok(describeIndex > 0, '必須新增 Task 43 describe 區塊');
  const lastLegacyIndex = spec.indexOf(legacyTitles[legacyTitles.length - 1]);
  assert.ok(
    describeIndex > lastLegacyIndex,
    '新區塊必須 append 在既有測試之後（append-only）',
  );
});

test('新 E2E 區塊使用旅客視角 helper（setTravelerSession）', () => {
  const spec = readSource(SPEC_REL);
  const block = spec.slice(spec.indexOf("test.describe('Task 43 traveler confirmation page'"));
  assert.match(block, /setTravelerSession\(page\)/u, '旅客視角必須用 setTravelerSession');
  assert.doesNotMatch(block, /loginMidaoGuideViaApi/u, '本區塊不得用導遊登入 helper');
});
