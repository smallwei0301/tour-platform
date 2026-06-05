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
  const src = await readSource('app/booking/[activityId]/page.tsx');

  assert.doesNotMatch(src, /<input type="radio" name="payment" \/> LINE Pay/);
  assert.doesNotMatch(src, /<input type="radio" name="payment" \/> ATM 虛擬帳號/);
  // No selectable payment radios should remain at all — checkout is ECPay-only.
  assert.doesNotMatch(src, /name="payment"/);
});

test('booking page Step 3 explains the ECPay hand-off instead of advertising unsupported methods', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');

  assert.match(src, /實際可用付款方式以付款頁顯示為準/);
  // Keep the existing security reassurance copy.
  assert.match(src, /付款由 ECPay 加密處理/);
});

test('V2 checkout submit still posts the ecpay provider that the API accepts', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');
  assert.match(src, /provider:\s*'ecpay'/);
});

test('checkout API contract still accepts only the ecpay provider', async () => {
  const src = await readSource('app/api/v2/bookings/[bookingId]/checkout/route.ts');
  assert.match(src, /const VALID_PROVIDERS = \['ecpay'\] as const;/);
});
