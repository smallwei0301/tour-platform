// #1475 — 匯款（手動查帳）付款方式：checkout transfer 分支、transfer-info 授權、
// 導遊匯款欄位 allowlist 與 feature flag 契約。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '..', '..');
const read = (rel) => readFileSync(join(webRoot, rel), 'utf8');

test('feature flag：isGuideShopEnabled / isTransferPaymentEnabled 預設 OFF', async () => {
  const flags = await import('../../src/config/feature-flags.mjs');
  assert.equal(flags.isGuideShopEnabled({}), false);
  assert.equal(flags.isTransferPaymentEnabled({}), false);
  assert.equal(flags.isTransferPaymentEnabled({ NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED: '1' }), true);
  assert.equal(flags.isGuideShopEnabled({ NEXT_PUBLIC_GUIDE_SHOP_ENABLED: 'true' }), true);
});

test('checkout 路由：VALID_PROVIDERS 含 transfer，且 transfer 分支不產生 ECPay 表單', () => {
  const src = read('app/api/v2/bookings/[bookingId]/checkout/route.ts');
  assert.match(src, /VALID_PROVIDERS\s*=\s*\[\s*'ecpay',\s*'transfer'\s*\]/);
  // transfer 分支須在 flag 關閉時擋下
  assert.match(src, /provider === 'transfer' && !isTransferPaymentEnabled\(\)/);
  // transfer 分支建立 pending 付款記錄、不回傳付款表單
  const branchStart = src.indexOf("if (provider === 'transfer')");
  assert.ok(branchStart > 0, '應有 transfer 分支');
  const branch = src.slice(branchStart, branchStart + 2500);
  assert.match(branch, /provider:\s*'transfer'/);
  assert.match(branch, /status:\s*'pending'/);
  assert.match(branch, /paymentFormHtml:\s*null/);
  assert.match(branch, /awaitingManualPayment:\s*true/);
  // transfer 分支不得呼叫 ECPay 表單產生
  assert.equal(branch.includes('generateCheckMacValue'), false, 'transfer 不得產生 ECPay CheckMacValue');
});

test('transfer-info 路由：授權需 pending_payment + 本人 email，且受 flag 控制', () => {
  const src = read('app/api/v2/bookings/[bookingId]/transfer-info/route.ts');
  assert.match(src, /isTransferPaymentEnabled\(\)/);
  assert.match(src, /orderStatus !== 'pending_payment'/);
  assert.match(src, /FORBIDDEN/);
  assert.match(src, /getGuideTransferInfoForBookingDb\(/);
  // 未設定匯款資訊時回 configured:false 而非揭露空值
  assert.match(src, /configured:\s*false/);
});

test('db：updateGuideProfileByGuideId allowlist 含 4 個匯款欄位', () => {
  const src = read('src/lib/db.mjs');
  const fnStart = src.indexOf('export async function updateGuideProfileByGuideId');
  const body = src.slice(fnStart, fnStart + 900);
  for (const col of ['bank_name', 'account_name', 'account_number', 'transfer_note']) {
    assert.ok(body.includes(`'${col}'`), `allowlist 應含 ${col}`);
  }
});

test('db：getGuideTransferInfoForBookingDb 存在且回傳授權所需欄位', async () => {
  const mod = await import('../../src/lib/db.mjs');
  assert.equal(typeof mod.getGuideTransferInfoForBookingDb, 'function');
  // fixture 模式（無 Supabase）不揭露匯款資料
  const r = await mod.getGuideTransferInfoForBookingDb('00000000-0000-4000-8000-000000000000');
  assert.equal(r, null);
  const src = read('src/lib/db.mjs');
  const fnStart = src.indexOf('export async function getGuideTransferInfoForBookingDb');
  const body = src.slice(fnStart, fnStart + 1500);
  for (const k of ['orderStatus', 'contactEmail', 'bankName', 'accountNumber']) {
    assert.ok(body.includes(k), `回傳需含 ${k}`);
  }
});

test('guide/profile 路由：EDITABLE_FIELDS 含匯款欄位且接受字串/null', () => {
  const src = read('app/api/guide/profile/route.ts');
  for (const col of ['bank_name', 'account_name', 'account_number', 'transfer_note']) {
    assert.ok(src.includes(`'${col}'`), `EDITABLE_FIELDS 應含 ${col}`);
  }
  assert.match(src, /must be a string or null/);
});
