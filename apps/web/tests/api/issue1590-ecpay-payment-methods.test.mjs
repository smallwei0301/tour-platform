/**
 * Issue #1590 — ECPay 多元付款（ATM＋超商）第一波 source-contract。
 *
 * 發現：checkout 已用 `ChoosePayment: 'ALL'`——ECPay 付款頁**已同時提供信用卡／ATM／
 * 超商代碼(CVS)**（實際顯示哪些取決於 owner 的 ECPay 商店帳號啟用了哪些）。故 P0-3
 * 「第一波：ATM＋超商」的**程式面已滿足**。本測試鎖住 ChoosePayment='ALL' 不被改窄，
 * 避免日後有人縮回 'Credit' 而悄悄關掉 ATM/超商。
 *
 * 尚未做（需 P0-OVERRIDE，屬凍結區 app/api/payments/ecpay/**）：PaymentInfoURL 回呼以
 * 儲存/站內重顯 ATM 虛擬帳號、CVS 繳費代碼＋依 ExpireDate 對齊逾期窗——見 #1590 追蹤。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

test('T1590.1 — v2 checkout 以 ChoosePayment:ALL 提供多元付款（含 ATM/超商）', () => {
  const src = read('app/api/v2/bookings/[bookingId]/checkout/route.ts');
  assert.match(src, /ChoosePayment:\s*'ALL'/, 'checkout 應以 ALL 提供多元付款；縮回 Credit 會關掉 ATM/超商');
});

test('T1590.2 — ecpay-create-orchestration 亦為 ALL（fallback/其他建單路徑一致）', () => {
  const src = read('src/lib/ecpay-create-orchestration.mjs');
  assert.match(src, /ChoosePayment:\s*'ALL'/, 'orchestration 應一致提供 ALL');
});
