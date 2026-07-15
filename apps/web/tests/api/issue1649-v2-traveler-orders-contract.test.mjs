/**
 * #1649 Phase 1+2 — traveler 訂單面 v2 全面接線 source-contract 測試。
 *
 * 鎖定：
 * 1. 新 v2 routes 存在、走標準骨架（jsonOk/jsonError＋handleRouteError/錯誤映射）、
 *    委派與 legacy 相同的 db gateway 函式（行為等價由 gateway 既有測試保證）。
 * 2. 寫入 route 一律 route 內顯式 validateCsrf（middleware 不涵蓋 /api/v2 非 admin）。
 * 3. 通知扇出與 legacy 等價（email/LINE/Telegram/推播 呼叫點逐一在場）。
 * 4. 前端四頁＋promo banner 零 legacy endpoint 呼叫（/api/me/orders、/api/promo-codes）。
 * 5. in-memory fallback（hasSupabaseEnv seam）在讀取面在場——保住無 env 測試環境。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');

// ── 1. 讀取面 ────────────────────────────────────────────────────────────

test('v2 orders list route：auth + rate limit + listMyOrdersDb 委派', async () => {
  const src = await read('app/api/v2/orders/route.ts');
  assert.match(src, /myOrdersLimiter\.check\(/, '沿用 legacy 相同 rate limit');
  assert.match(src, /jsonError\('UNAUTHORIZED',\s*'Please login first',\s*401\)/);
  assert.match(src, /listMyOrdersDb\(\{ userId: user\.id, contactEmail: user\.email \}\)/, '資料層與 legacy 相同 gateway');
  assert.match(src, /handleRouteError\(err,\s*\{ route: 'v2\/orders\/list' \}\)/);
});

test('v2 orders detail route：legacy 欄位聯集 + guest email + voucher + in-memory fallback', async () => {
  const src = await read('app/api/v2/orders/[orderId]/route.ts');
  // legacy 詳情欄位聯集
  for (const field of ['paidAt', 'paymentDeadlineAt', 'title', 'experienceSlug', 'guideSlug', 'scheduleId', 'scheduleStartAt']) {
    assert.match(src, new RegExp(`${field}:`), `詳情回應需含 ${field}`);
  }
  // #1565 voucher（confirmed 簽發）
  assert.match(src, /signVoucherToken\(/);
  assert.match(src, /shortCodeForOrder\(/);
  assert.match(src, /!== 'confirmed'/, 'voucher 僅 confirmed 簽發');
  // guest ?contactEmail=（/order/success 未登入情境）
  assert.match(src, /searchParams\.get\('contactEmail'\)/);
  // in-memory fallback seam
  assert.match(src, /hasSupabaseEnv\(\)/);
  assert.match(src, /getMyOrderDetailDb\(/);
  // #1493 部署順序安全：payment_deadline_at 缺欄位 fallback
  assert.match(src, /selectWithOptionalColumnFallback/);
});

test('v2 orders detail route：訪客無 email 才 401；ownership isOrderOwner 把關', async () => {
  const src = await read('app/api/v2/orders/[orderId]/route.ts');
  assert.match(src, /if \(!user\?\.id && !user\?\.email\)/);
  assert.match(src, /isOrderOwner\(typedOrder,/);
  assert.match(src, /jsonError\('FORBIDDEN',[\s\S]*?403\)/);
});

// ── 2. 寫入面（CSRF + 委派 + 通知等價）──────────────────────────────────

test('v2 cancel route：CSRF + cancelOrderDb + 全通路通知扇出（與 legacy PATCH cancel 等價）', async () => {
  const src = await read('app/api/v2/orders/[orderId]/cancel/route.ts');
  assert.match(src, /validateCsrf\(request\)/, 'v2 非 admin 路徑必須 route 內顯式 CSRF');
  assert.match(src, /cancelOrderDb\(\{ orderId, contactEmail: user\.email \}\)/);
  for (const fn of ['sendOrderCancellation', 'notifyOrderCancelled', 'pushTravelerOrderEvent', 'pushGuideOrderEvent', 'dispatchOrderEventEmails', 'dispatchOrderEventTelegram']) {
    assert.match(src, new RegExp(`${fn}\\(`), `取消通知扇出需含 ${fn}`);
  }
  assert.match(src, /kind: 'order_cancelled'/);
  assert.match(src, /kind: 'guide_order_cancelled'/);
});

test('v2 refund-requests route：CSRF + 冪等 requestId + policy snapshot + auto-execute + 通知等價', async () => {
  const src = await read('app/api/v2/orders/[orderId]/refund-requests/route.ts');
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /parseBody\(request,\s*RefundRequestBodySchema\)/, 'zod schema 驗證（#1600）');
  assert.match(src, /createRefundRequestDb\(\{/);
  assert.match(src, /listRefundRequestsDb\(\{ orderId \}\)/);
  // policy snapshot best-effort（失敗不擋申請）
  assert.match(src, /policySnapshot/);
  assert.match(src, /calculateRefundAmount\(/);
  // auto-execute 移植（含 trade_no guard 與 eligibility guard）
  assert.match(src, /REFUND_AUTO_EXECUTE/);
  assert.match(src, /executeRefund\(\{/);
  assert.match(src, /orderRow\.trade_no/, '僅信用卡單（有 trade_no）可 auto-execute');
  assert.match(src, /recordRefundReversalDb\(/);
  assert.match(src, /\.eq\('status', 'requested'\)/, 'refund_requests 終態同步需 status guard');
  // 通知：申請與已完成兩種扇出都在
  for (const fn of ['sendRefundRequested', 'sendRefundExecuted', 'notifyRefundRequest', 'notifyRefundExecuted', 'pushTravelerOrderEvent', 'pushGuideOrderEvent', 'dispatchOrderEventEmails', 'dispatchOrderEventTelegram']) {
    assert.match(src, new RegExp(`${fn}`), `退款通知扇出需含 ${fn}`);
  }
});

test('v2 reschedule 三支：CSRF（寫入）+ db gateway 委派 + 通知', async () => {
  const options = await read('app/api/v2/orders/[orderId]/reschedule-options/route.ts');
  assert.match(options, /listRescheduleOptionsDb\(\{ orderId, contactEmail \}\)/);
  assert.match(options, /rescheduleErrorToResponseParts\(/);

  const create = await read('app/api/v2/orders/[orderId]/reschedule-requests/route.ts');
  assert.match(create, /validateCsrf\(request\)/);
  assert.match(create, /parseBody\(request,\s*RescheduleRequestBodySchema\)/);
  assert.match(create, /createRescheduleRequestDb\(\{/);
  assert.match(create, /notifyRescheduleRequested\(/);
  assert.match(create, /\{ status: 201 \}/, '建立回 201（與 legacy 等價）');

  const withdraw = await read('app/api/v2/orders/[orderId]/reschedule-requests/[requestId]/route.ts');
  assert.match(withdraw, /validateCsrf\(request\)/);
  assert.match(withdraw, /withdrawRescheduleRequestDb\(\{ requestId, contactEmail: user\.email \}\)/);
});

test('v2 messages route：CSRF + rate limit + 窗口由 gateway 把關 + 通知導遊', async () => {
  const src = await read('app/api/v2/orders/[orderId]/messages/route.ts');
  assert.match(src, /validateCsrf\(request\)/);
  assert.match(src, /messageSendLimiter\.check\(`order-message:traveler:/);
  assert.match(src, /listOrderMessagesDb\(\{ orderId, contactEmail: user\.email \}\)/);
  assert.match(src, /createOrderMessageDb\(\{/);
  assert.match(src, /senderRole: 'traveler'/);
  assert.match(src, /orderMessageErrorToResponseParts\(/);
  assert.match(src, /notifyGuideOfOrderMessage\(/);
  assert.match(src, /\{ status: 201 \}/);
});

test('v2 guide-contact route：資格外回 null、不外洩電話（#1596 語意不變）', async () => {
  const src = await read('app/api/v2/orders/[orderId]/guide-contact/route.ts');
  assert.match(src, /getEligibleGuideContactDb\(\{/);
  assert.match(src, /jsonOk\(\{ guideContact \}\)/);
  assert.ok(
    !/contact_phone|contactPhone/.test(src.replace(/guide-contact|getEligibleGuideContactDb/g, '')),
    'route 不得自行組裝電話欄位——只轉發資格函式結果'
  );
});

test('v2 order payments route：ownership 先行 + service-role 讀 payments + 不外洩敏感欄位', async () => {
  const src = await read('app/api/v2/orders/[orderId]/payments/route.ts');
  assert.match(src, /isOrderOwner\(/);
  assert.match(src, /createServiceRoleClient\(\)/, '#614 後 payments 表 service_role-only');
  assert.match(src, /jsonError\('FORBIDDEN',[\s\S]*?403\)/);
  assert.ok(!src.includes('merchant_trade_no'), '不回傳 merchant_trade_no');
  assert.ok(!src.includes('raw_payload'), '不回傳 provider 原始 payload');
  assert.match(src, /jsonOk\(\{ items \}\)/, '契約 §4.2 shape：{ items: [...] }');
});

test('v2 promo-codes public route：fail-open 空清單 + 不外洩內部統計', async () => {
  const src = await read('app/api/v2/promo-codes/public/route.ts');
  assert.match(src, /selectPublicPromoCodes\(/);
  assert.match(src, /jsonOk\(\[\]\)/, '故障 fail-open 空清單');
  assert.match(src, /cache-control/);
});

// ── 3. 前端零 legacy 呼叫 ────────────────────────────────────────────────

test('traveler 前端頁面零 legacy 訂單 endpoint 呼叫', async () => {
  const pages = [
    'app/(non-locale)/me/orders/page.tsx',
    'app/(non-locale)/me/orders/[orderId]/page.tsx',
    'app/(non-locale)/order/success/page.tsx',
    'app/(non-locale)/guides/[slug]/shop/orders/page.tsx',
  ];
  for (const page of pages) {
    const src = await read(page);
    assert.ok(!src.includes('/api/me/orders'), `${page} 不得再呼叫 /api/me/orders`);
    assert.match(src, /\/api\/v2\/orders/, `${page} 需改走 /api/v2/orders`);
  }
  // CSRF cookie 發放端點保留（/api/me/csrf 是 token 發放、非訂單資料面）
  const detail = await read('app/(non-locale)/me/orders/[orderId]/page.tsx');
  assert.match(detail, /\/api\/me\/csrf/);
});

test('PublicPromoBanner 改走 /api/v2/promo-codes/public', async () => {
  const src = await read('src/components/activity/PublicPromoBanner.tsx');
  assert.ok(!src.includes("'/api/promo-codes/public'"), '不得再呼叫 legacy 端點');
  assert.match(src, /\/api\/v2\/promo-codes\/public/);
});

test('client-api.ts 死碼 helper 已清除（僅留 activity 讀取 helper）', async () => {
  const src = await read('src/lib/client-api.ts');
  for (const dead of ['fetchExperiences', 'fetchMyOrders', 'fetchMyOrderDetail', 'fetchRefundRequests', 'createRefundRequest', 'submitEcpayCallback']) {
    assert.ok(!src.includes(`function ${dead}`), `${dead} 應已移除`);
  }
  assert.match(src, /fetchActivityByIdOrSlug/, 'booking 頁仍依賴的 helper 需保留');
});

// ── 4. 共用身分 helper（env seam）────────────────────────────────────────

test('getTravelerIdentity：有 env 拋錯不降級、無 env 回空身分（測試 seam）', async () => {
  const src = await read('src/lib/v2/traveler-auth.ts');
  assert.match(src, /if \(!hasSupabaseEnv\(\)\) return \{ id: null, email: null \};/);
  assert.match(src, /throw err;/, '有 env 時 auth 失敗必須浮現（不得靜默變訪客）');
});
