/**
 * issue #1474 — 部分退款落地修正（staging 實測抓到的 P0）
 *
 * 背景：refund-execute 原本寫入 `orders.refunded_amount`，但該欄位在真實 Supabase
 * schema 不存在（無任何 migration 建立、也無任何讀取點），導致每次「執行退款」回
 * 500 DB_UPDATE_FAILED（全額與部分退款皆然）。in-memory fallback 照單全收任何欄位，
 * 故單元測試全綠卻在 production 壞 —— 典型 fallback/Supabase 契約落差（參 #1376）。
 *
 * 修正：
 *  1. 不再寫入幽靈欄位 orders.refunded_amount。
 *  2. 退款金額改記入 operations_tracking.refund_amount_twd —— 導遊出帳結算
 *     （settlement-config.ts / settlement sweep / guide payout）真正讀取的欄位，
 *     部分退款才會反映到導遊撥款（effective GMV = total − refund_amount_twd）。
 *  3. orders.payment_status 以 partially_refunded / refunded / voided 區分。
 *
 * 本檔為 source-contract 測試，鎖定 route/helper 線路（不依賴 Supabase）。
 *
 * Run: node --test apps/web/tests/api/issue1474-refund-payout-wiring.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const routeSrc = readFileSync(
  join(repoRoot, 'app/api/v2/admin/orders/[orderId]/refund-execute/route.ts'),
  'utf8',
);
const helperSrc = readFileSync(join(repoRoot, 'src/lib/refund-execute.ts'), 'utf8');

// orders 真實 schema 僅有 status + payment_status（+ 原始欄位）；
// refunded_amount / refunded_at / ecpay_refund_trade_no 皆未經任何 migration 建立，
// 寫入會回 500 DB_UPDATE_FAILED。退款明細落在 payments / payment_events（以 `.prop =`
// 賦值，非物件字面 `prop:`）與 operations_tracking。故以下鎖定物件字面寫入已移除。
test('route：不再以物件字面寫入幽靈 orders 欄位（refunded_amount/refunded_at/ecpay_refund_trade_no）', () => {
  assert.ok(!/refunded_amount:\s/.test(routeSrc), 'route.ts 不應有 `refunded_amount:` 寫入');
  assert.ok(!/refunded_at:\s/.test(routeSrc), 'route.ts orders 不應寫 `refunded_at:`（payments 以賦值寫）');
  assert.ok(!/ecpay_refund_trade_no:\s/.test(routeSrc), 'route.ts orders 不應寫 `ecpay_refund_trade_no:`');
});

test('helper：executeRefund/executeEcpayReversal 不再寫入幽靈 orders 欄位', () => {
  assert.ok(!/refunded_amount:\s/.test(helperSrc), 'refund-execute.ts 不應有 `refunded_amount:` 寫入');
  assert.ok(!/refunded_at:\s/.test(helperSrc), 'refund-execute.ts 不應有 `refunded_at:` 寫入');
  assert.ok(!/ecpay_refund_trade_no:\s/.test(helperSrc), 'refund-execute.ts 不應有 `ecpay_refund_trade_no:` 寫入');
});

test('route：退款成功時寫入 operations_tracking.refund_amount_twd（出帳真正讀的欄位）', () => {
  assert.match(
    routeSrc,
    /recordOperationsRefundAmount/,
    'route.ts 應呼叫 recordOperationsRefundAmount 同步出帳退款金額',
  );
  assert.match(
    routeSrc,
    /from\(['"]operations_tracking['"]\)/,
    'route.ts 應更新 operations_tracking 表',
  );
  assert.match(
    routeSrc,
    /refund_amount_twd/,
    'route.ts operations_tracking 寫入應包含 refund_amount_twd',
  );
});

test('route：operations_tracking 採針對性 upsert，不覆寫 ops 既有欄位', () => {
  // 只更新 refund_amount_twd + updated_at；不得呼叫會全欄覆寫的 updateOperationsTrackingDb。
  assert.ok(
    !/updateOperationsTrackingDb/.test(routeSrc),
    '不應用全欄覆寫的 updateOperationsTrackingDb（會清空 manual_minutes/holds 等人工欄位）',
  );
});

test('route：orders.payment_status 以 partially_refunded / refunded / voided 區分', () => {
  assert.match(routeSrc, /partially_refunded/, 'route.ts 應設定 partially_refunded');
  assert.match(routeSrc, /payment_status/, 'route.ts 應寫入 payment_status');
});

test('helper：persistReversal 契約帶 partial 旗標', () => {
  assert.match(
    helperSrc,
    /partial:\s*boolean/,
    'persistReversal 型別應包含 partial: boolean',
  );
  assert.match(
    helperSrc,
    /partial:\s*action === 'R' \? resolvedAmount\.partial : false/,
    'executeEcpayReversal 應依 Action=R + resolvedAmount.partial 傳遞 partial',
  );
});
