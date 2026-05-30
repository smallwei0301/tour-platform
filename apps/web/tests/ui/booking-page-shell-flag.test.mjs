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

test('booking page uses deployable shell flag helper instead of runtime-only fallback helper', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');

  assert.match(src, /isBookingV2ShellEnabled\(/);
  assert.doesNotMatch(src, /isBookingV2Enabled\(/);
});

test('missing-plan fallback can actually render legacy shell by checking branch order', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');

  const useLegacyIndex = src.indexOf('if (useLegacyFallback) {');
  const missingPlanIndex = src.indexOf('if (!canRunV2PlanFlow) {');

  assert.ok(useLegacyIndex >= 0, 'expected useLegacyFallback branch');
  assert.ok(missingPlanIndex >= 0, 'expected missing-plan branch');
  assert.ok(useLegacyIndex < missingPlanIndex, 'legacy fallback branch should be checked before missing-plan branch');
});

test('v2-primary booking shell checkout path uses v2 draft+checkout APIs instead of legacy createOrder(/api/orders)', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');
  const v2Start = src.indexOf('function BookingInnerV2FlagShell()');
  const v2End = src.indexOf('if (useLegacyFallback) {');
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
  const v2End = src.indexOf('if (useLegacyFallback) {');
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
  const v2FallbackBranch = src.indexOf('if (useLegacyFallback) {');
  assert.ok(v2Start >= 0 && v2FallbackBranch > v2Start, 'expected bounded V2 shell source range');

  const v2ShellPreRender = src.slice(v2Start, v2FallbackBranch);

  assert.match(v2ShellPreRender, /selectedPlanDisplayName/);
  assert.match(v2ShellPreRender, /selectedPlan\.displayName, selectedPlan\.label, selectedPlan\.name/);
  assert.match(src, /📋 方案：\{selectedPlanDisplayName \|\|/);
  assert.match(src, /方案代碼 \$\{urlPlanId\.slice\(0, 8\)\}/);
});

test('v2 shell keeps exact legacy booking presentation markers while retaining v2 mutation path', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');
  const v2Start = src.indexOf('function BookingInnerV2FlagShell()');
  const v2End = src.indexOf('// ── 外層包 Suspense（useSearchParams 需要）');
  assert.ok(v2Start >= 0 && v2End > v2Start, 'expected bounded V2 shell source range');

  const v2ShellSource = src.slice(v2Start, v2End);

  const legacyMarkers = [
    '選擇可預約場次',
    '費用明細',
    '平台服務費',
    '取消政策',
    '請輸入真實姓名',
    '0912-345-678',
    '給導遊的備註（選填）',
    '服務條款',
    '退款政策',
    '建立訂單並前往付款',
    '信用卡（Visa / Mastercard / JCB）',
    'LINE Pay',
    'ATM 虛擬帳號',
    '付款由 ECPay 加密處理',
    '訂單編號：',
    "top: 80",
    "aspectRatio: '16/9'",
  ];

  for (const marker of legacyMarkers) {
    assert.match(v2ShellSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')));
  }

  assert.doesNotMatch(v2ShellSource, /Step\s*1｜/);
  assert.doesNotMatch(v2ShellSource, /Step\s*2｜/);
  assert.doesNotMatch(v2ShellSource, /Step\s*3｜/);
  assert.doesNotMatch(v2ShellSource, /將使用 V2 草稿與 checkout 流程建立綠界付款表單/);
  assert.doesNotMatch(v2ShellSource, /（V2 預約流程）/);
});
