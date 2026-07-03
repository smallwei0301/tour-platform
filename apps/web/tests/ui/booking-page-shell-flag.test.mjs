import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isBookingV2ShellEnabled } from '../../src/config/feature-flags.mjs';

// Use import.meta.url so paths are portable regardless of cwd (works from repo root or apps/web/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(WEB_ROOT, relPath), 'utf8');
}

test('booking page shell defaults to V2 when NEXT_PUBLIC flag is not set', () => {
  assert.equal(isBookingV2ShellEnabled({}), true);
});

test('booking page shell allows explicit legacy fallback only through NEXT_PUBLIC flag', () => {
  assert.equal(isBookingV2ShellEnabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: '0' }), false);
  assert.equal(isBookingV2ShellEnabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: 'false' }), false);
});

// Legacy 退役階段二（#1406）：/booking 殼層一律走 Booking V2；flag fallback UI 已移除。
// 頁面不再讀 shell flag 分支，也不再保留 BookingInnerLegacy / useLegacyFallback 降級路徑。
test('booking page always renders the V2 shell and no longer branches into a legacy fallback', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');

  // 只渲染 V2 shell；不得再有 legacy fallback 元件或 flag 分支
  assert.match(src, /<BookingInnerV2FlagShell \/>/, 'default export must render the V2 shell');
  assert.doesNotMatch(src, /BookingInnerLegacy/, 'legacy booking component must be removed (階段二退役)');
  assert.doesNotMatch(src, /useLegacyFallback/, 'legacy fallback branch/state must be removed');
  // 不得再有降級到 legacy checkout 的舊版下單/付款呼叫
  assert.doesNotMatch(src, /createOrder\(/, 'legacy createOrder() path must be gone');
  assert.doesNotMatch(src, /submitEcpayCallback\(/, 'legacy mock-payment path must be gone');
});

test('v2-primary booking shell checkout path uses v2 draft+checkout APIs instead of legacy createOrder(/api/orders)', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');
  const v2Start = src.indexOf('function BookingInnerV2FlagShell()');
  const v2End = src.indexOf('// ── 外層包 Suspense');
  assert.ok(v2Start >= 0 && v2End > v2Start, 'expected bounded V2 shell source range');

  const v2ShellSource = src.slice(v2Start, v2End);

  assert.match(v2ShellSource, /\/api\/v2\/bookings\/draft/);
  assert.match(v2ShellSource, /\/api\/v2\/bookings\/\$\{createdBookingId\}\/checkout/);
  assert.match(v2ShellSource, /if \(!createdBookingId \|\| !agreed\)/);
  assert.doesNotMatch(v2ShellSource, /createOrder\(/);
  assert.doesNotMatch(v2ShellSource, /fetch\('\/api\/orders'/);
  assert.doesNotMatch(v2ShellSource, /submitEcpayCallback\(/);
  assert.doesNotMatch(v2ShellSource, /handleMockPaymentSuccess/);
});

test('v2 shell posts resolved UUID activityId and planId from available-slots response into draft payload', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');
  const v2Start = src.indexOf('function BookingInnerV2FlagShell()');
  const v2End = src.indexOf('// ── 外層包 Suspense');
  assert.ok(v2Start >= 0 && v2End > v2Start, 'expected bounded V2 shell source range');

  const v2ShellSource = src.slice(v2Start, v2End);

  assert.match(v2ShellSource, /setResolvedActivityId\(json\.data\?\.activityId \|\| activity\?\.id \|\| ''\)/);
  assert.match(v2ShellSource, /setResolvedPlanId\(json\.data\?\.planId \|\| resolvedPlanCandidate\)/);
  assert.match(v2ShellSource, /activityId: resolvedActivityId/);
  assert.match(v2ShellSource, /planId: resolvedPlanId/);
});

test('v2 shell renders selected plan display name and avoids showing raw UUID in plan summary', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');
  const v2Start = src.indexOf('function BookingInnerV2FlagShell()');
  const v2FallbackBranch = src.indexOf('// ── 外層包 Suspense');
  assert.ok(v2Start >= 0 && v2FallbackBranch > v2Start, 'expected bounded V2 shell source range');

  const v2ShellPreRender = src.slice(v2Start, v2FallbackBranch);

  assert.match(v2ShellPreRender, /selectedPlanDisplayName/);
  assert.match(v2ShellPreRender, /selectedPlan\.displayName, selectedPlan\.label, selectedPlan\.name/);
  // #multilingual: plan summary copy moved to bookingFlow.planPrefix / planCodePrefix；
  // 頁面改用 m.<key> 引用，內容類斷言改讀繁中 catalog。
  const zh = JSON.parse(await readSource('messages/zh-Hant.json'));
  assert.match(zh.bookingFlow.planPrefix, /📋 方案：/);
  assert.match(zh.bookingFlow.planCodePrefix, /方案代碼 \{code\}/);
  assert.match(src, /\{m\.planPrefix\}\{selectedPlanDisplayName \|\|/);
  assert.match(src, /m\.planCodePrefix\.replace\('\{code\}', urlPlanId\.slice\(0, 8\)\)/);
});

test('v2 shell keeps exact legacy booking presentation markers while retaining v2 mutation path', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');
  const v2Start = src.indexOf('function BookingInnerV2FlagShell()');
  const v2End = src.indexOf('// ── 外層包 Suspense（useSearchParams 需要）');
  assert.ok(v2Start >= 0 && v2End > v2Start, 'expected bounded V2 shell source range');

  const v2ShellSource = src.slice(v2Start, v2End);

  // #multilingual: 面向使用者的中文文案已移到 messages/zh-Hant.json 的 bookingFlow namespace；
  // V2 shell 改用 m.<key> 引用。內容類 marker 改驗「繁中 catalog 仍含此 copy」+「V2 shell 引用對應 key」；
  // 純結構類 marker（樣式字串）仍直接驗 source。
  const zh = JSON.parse(await readSource('messages/zh-Hant.json'));
  const bf = zh.bookingFlow;
  const copyMarkers = [
    { key: 'selectSlotLabel', copy: '選擇可預約場次' },
    { key: 'feeDetailHeading', copy: '費用明細' },
    { key: 'platformFee', copy: '平台服務費' },
    { key: 'cancelPolicyHeading', copy: '取消政策' },
    { key: 'contactNamePlaceholder', copy: '請輸入真實姓名' },
    { key: 'contactPhonePlaceholder', copy: '0912-345-678' },
    { key: 'noteLabel', copy: '給導遊的備註（選填）' },
    { key: 'agreeTerms', copy: '服務條款' },
    { key: 'agreeRefund', copy: '退款政策' },
    { key: 'createOrderAndPay', copy: '建立訂單並前往付款' },
    { key: 'creditCard', copy: '信用卡（Visa / Mastercard / JCB）' },
    // Issue #1261: LINE Pay / ATM 虛擬帳號 were removed because the V2 checkout
    // contract only supports the ecpay provider; advertising them as selectable
    // was misleading. The ECPay hand-off copy below replaces them.
    { key: 'ecpayTransferNotice', copy: '實際可用付款方式以付款頁顯示為準' },
    { key: 'ecpayTransferNotice', copy: '付款由 ECPay 加密處理' },
    { key: 'orderNumberPrefix', copy: '訂單編號：' },
  ];
  for (const { key, copy } of copyMarkers) {
    assert.match(bf[key], new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `bookingFlow.${key} must hold copy "${copy}"`);
    assert.match(v2ShellSource, new RegExp(`m\\.${key}\\b`), `V2 shell must reference m.${key}`);
  }

  const structuralMarkers = [
    "top: 80",
    "aspectRatio: '16/9'",
  ];
  for (const marker of structuralMarkers) {
    assert.match(v2ShellSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  // Issue #1261: no selectable LINE Pay / ATM payment radios may reappear.
  assert.doesNotMatch(v2ShellSource, /name="payment"/);
  assert.doesNotMatch(v2ShellSource, /LINE Pay/);
  assert.doesNotMatch(v2ShellSource, /ATM 虛擬帳號/);

  assert.doesNotMatch(v2ShellSource, /Step\s*1｜/);
  assert.doesNotMatch(v2ShellSource, /Step\s*2｜/);
  assert.doesNotMatch(v2ShellSource, /Step\s*3｜/);
  assert.doesNotMatch(v2ShellSource, /將使用 V2 草稿與 checkout 流程建立綠界付款表單/);
  assert.doesNotMatch(v2ShellSource, /（V2 預約流程）/);
});
