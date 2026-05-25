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
  const missingPlanIndex = src.indexOf('if (!urlPlanId) {');

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
  assert.match(v2ShellSource, /\/api\/v2\/bookings\/\$\{draftJson\.data\.bookingId\}\/checkout/);
  assert.doesNotMatch(v2ShellSource, /createOrder\(/);
  assert.doesNotMatch(v2ShellSource, /fetch\('\/api\/orders'/);
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

test('v2 shell uses legacy-style booking UI markers and removes debug V2 title', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');
  const v2Start = src.indexOf('function BookingInnerV2FlagShell()');
  const v2End = src.indexOf('// ── 外層包 Suspense（useSearchParams 需要）');
  assert.ok(v2Start >= 0 && v2End > v2Start, 'expected bounded V2 shell source range');

  const v2ShellSource = src.slice(v2Start, v2End);

  assert.match(v2ShellSource, /行程確認/);
  assert.match(v2ShellSource, /旅客資訊/);
  assert.match(v2ShellSource, /付款/);
  assert.match(v2ShellSource, /下一步：填寫資訊/);
  assert.match(v2ShellSource, /預約摘要/);
  assert.doesNotMatch(v2ShellSource, /（V2 預約流程）/);
});
