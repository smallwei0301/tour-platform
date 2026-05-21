import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('activity date-plan UI does not trigger mount-time live availability fetch', async () => {
  const src = await readSource('src/components/activity/DatePlanSection.tsx');

  // No mount effect-driven fetch.
  assert.doesNotMatch(src, /useEffect\s*\(/);

  // Live API fetch still exists for intent-driven refresh.
  assert.ok(
    src.includes('/api/activities/${encodeURIComponent(activity.slug)}/availability'),
    'expected intent-driven availability fetch call to exist'
  );
});

test('live availability refresh is only wired to high-intent actions', async () => {
  const src = await readSource('src/components/activity/DatePlanSection.tsx');

  // High-intent hooks: date select, plan card select, book-now click.
  const calls = src.match(/void ensureLiveAvailability\(\);/g) || [];
  assert.equal(calls.length, 3);

  assert.match(src, /onSelect=\{\(date\) => \{\s*void ensureLiveAvailability\(\);/s);
  assert.match(src, /onClick=\{\(\) => \{\s*if \(!canBook\) return;\s*void ensureLiveAvailability\(\);/s);
  assert.match(src, /className="tp-btn tp-btn-primary kkd-plan-select-btn"[\s\S]*?onClick=\{\(\) => \{\s*void ensureLiveAvailability\(\);/s);
});

test('V2 mode requests v2 availability source and exposes explicit fallback notice', async () => {
  const src = await readSource('src/components/activity/DatePlanSection.tsx');

  assert.match(src, /availability\?v2=1/);
  assert.match(src, /json\?\.data\?\.source !== 'v2'/);
  assert.match(src, /目前無法即時載入 V2 可預約名額/);
});

test('date picker availability is scoped to selected or visible plans plus global schedules', async () => {
  const src = await readSource('src/components/activity/DatePlanSection.tsx');

  assert.match(src, /const selectedOrVisiblePlanIds = selectedPlan \? \[selectedPlan\] : VISIBLE_PLANS\.map\(\(p\) => p\.id\);/);
  assert.match(src, /const datePickerSchedules = effectiveSchedules\.filter\(\(s\) => \{/);
  assert.match(src, /return planId === null \|\| selectedOrVisiblePlanIds\.includes\(planId\);/);
  assert.match(src, /<DatePicker\s+[\s\S]*schedules=\{datePickerSchedules\}/);
});

test('checkout/payment callback still enforce strong-consistency conflict semantics', async () => {
  const checkoutSrc = await readSource('app/api/v2/bookings/[bookingId]/checkout/route.ts');
  const callbackSrc = await readSource('app/api/payments/ecpay/callback/route.ts');

  // Checkout state gates remain strict.
  assert.match(checkoutSrc, /Booking must be in draft status to checkout/);
  assert.match(checkoutSrc, /Order must be pending_payment to checkout/);

  // Payment callback still maps capacity/state races to conflict class.
  assert.match(callbackSrc, /insufficient_capacity/);
  assert.match(callbackSrc, /booking_failed/);
  assert.match(callbackSrc, /const status = httpStatusFromError\(err\);/);
  assert.match(callbackSrc, /status === 409 \? 'BOOKING_CONFLICT'/);
});
