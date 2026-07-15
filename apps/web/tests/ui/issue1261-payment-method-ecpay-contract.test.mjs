import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Issue #1261 — Align Booking V2 payment method UI with the checkout provider contract.
//
// Booking V2 Step 3 used to render selectable "LINE Pay" and "ATM 虛擬帳號" radio
// options, but handleV2Checkout() always posts { provider: 'ecpay' } and the
// /api/v2/bookings/[bookingId]/checkout route only accepts provider 'ecpay'
// (ECPay-hosted page with ChoosePayment: 'ALL'). The selectable options were
// therefore misleading during soft launch. These source-contract tests lock the
// UI to the real checkout contract. Browser-level E2E for Step 3 is blocked
// (NOT_AUTOMATABLE: reaching Step 3 requires resolved availability + a created
// draft booking against live V2 APIs), so the visible-copy guarantee is enforced
// here at the source level.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(WEB_ROOT, relPath), 'utf8');
}

test('booking page no longer offers LINE Pay / ATM as selectable payment radios', async () => {
  const src = await readSource('app/(non-locale)/booking/[activityId]/page.tsx');

  assert.doesNotMatch(src, /<input type="radio" name="payment" \/> LINE Pay/);
  assert.doesNotMatch(src, /<input type="radio" name="payment" \/> ATM 虛擬帳號/);
  // No selectable payment radios should remain at all — checkout is ECPay-only.
  assert.doesNotMatch(src, /name="payment"/);
});

test('booking page Step 3 explains the ECPay hand-off instead of advertising unsupported methods', async () => {
  const src = await readSource('app/(non-locale)/booking/[activityId]/page.tsx');

  // #multilingual: ECPay hand-off 文案移到 bookingFlow.ecpayTransferNotice；頁面用 m.ecpayTransferNotice 引用。
  const zh = JSON.parse(await readSource('messages/zh-Hant.json'));
  assert.match(zh.bookingFlow.ecpayTransferNotice, /實際可用付款方式以付款頁顯示為準/);
  // Keep the existing security reassurance copy.
  assert.match(zh.bookingFlow.ecpayTransferNotice, /付款由 ECPay 加密處理/);
  assert.match(src, /m\.ecpayTransferNotice/, 'page must reference m.ecpayTransferNotice');
});

// #1475 起：付款方式新增「自行匯款（transfer）」選項，但以 isTransferPaymentEnabled()
// flag 控管（預設 OFF）。flag off 時行為等同 #1261 的 ECPay-only；flag on 才顯示匯款選項。
test('V2 checkout submit posts the selected payment method (預設 ecpay)', async () => {
  const src = await readSource('app/(non-locale)/booking/[activityId]/page.tsx');
  // 改為送出使用者選擇的付款方式；payMethod 預設為 'ecpay'。
  assert.match(src, /provider:\s*payMethod/);
  assert.match(src, /useState<'ecpay' \| 'transfer'>\('ecpay'\)/);
});

test('checkout API contract accepts ecpay + transfer（transfer 受 flag 控管）', async () => {
  const src = await readSource('app/api/v2/bookings/[bookingId]/checkout/route.ts');
  assert.match(src, /const VALID_PROVIDERS = \['ecpay', 'transfer'\] as const;/);
  // transfer 必須先過 feature flag
  assert.match(src, /provider === 'transfer' && !isTransferPaymentEnabled\(\)/);
});
