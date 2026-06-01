import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDatePlanPresentation } from '../../src/lib/date-plan-source.mjs';
import { BOOKING_V2_STEP1_CTA_REASON_ID, getBookingV2Step1CtaState } from '../../src/lib/booking-v2-step1-cta-state.mjs';

const DEFAULT_PLANS = [
  { id: 'half-day', label: 'A. 半日行程', bookingBtnText: '立即預約' },
  { id: 'full-day', label: 'B. 全日行程', bookingBtnText: '立即預約' },
];

const MISSING_CANONICAL_MESSAGE = '此行程尚未設定可預約方案，請稍後再查看。';

function deriveVisiblePlanLabels(presentation) {
  return presentation.plans.map((plan) => plan.label);
}

function deriveVisibleCtas(presentation) {
  return presentation.plans.map((plan) => plan.bookingBtnText || '立即預約');
}

test('GH-1069: Booking V2 missing canonical plans does not expose fallback plans/CTAs and should show message state', () => {
  const presentation = resolveDatePlanPresentation({
    useBookingV2: true,
    canonicalPlans: [],
    defaultPlans: DEFAULT_PLANS,
  });

  const labels = deriveVisiblePlanLabels(presentation);
  const ctas = deriveVisibleCtas(presentation);

  assert.equal(presentation.showMissingCanonicalMessage, true);
  assert.deepEqual(labels, []);
  assert.deepEqual(ctas, []);
  assert.equal(labels.includes('A. 半日行程'), false);
  assert.equal(labels.includes('B. 全日行程'), false);
  assert.equal(ctas.includes('立即預約'), false);
  assert.equal(MISSING_CANONICAL_MESSAGE, '此行程尚未設定可預約方案，請稍後再查看。');
});

test('GH-1069: non-V2 keeps intentional legacy fallback plans', () => {
  const presentation = resolveDatePlanPresentation({
    useBookingV2: false,
    canonicalPlans: [],
    defaultPlans: DEFAULT_PLANS,
  });

  const labels = deriveVisiblePlanLabels(presentation);
  const ctas = deriveVisibleCtas(presentation);

  assert.equal(presentation.showMissingCanonicalMessage, false);
  assert.equal(labels.includes('A. 半日行程'), true);
  assert.equal(labels.includes('B. 全日行程'), true);
  assert.equal(ctas.includes('立即預約'), true);
});

test('GH-1069: Step1 disabled reason matrix returns exact zh-TW copy and accessibility metadata', () => {
  const loading = getBookingV2Step1CtaState({
    slotsLoading: true,
    slotsCount: 0,
    guests: 2,
    selectedCapacityLeft: 0,
  });
  assert.equal(loading.disabled, true);
  assert.equal(loading.reason, '正在確認可預約名額…');
  assert.equal(loading.reasonId, BOOKING_V2_STEP1_CTA_REASON_ID);
  assert.equal(loading.role, 'status');
  assert.equal(loading.tone, 'muted');

  const noSlots = getBookingV2Step1CtaState({
    slotsLoading: false,
    slotsCount: 0,
    guests: 2,
    selectedCapacityLeft: 0,
  });
  assert.equal(noSlots.disabled, true);
  assert.equal(noSlots.reason, '此日期目前無可預約名額，請選擇其他日期。');
  assert.equal(noSlots.reasonId, BOOKING_V2_STEP1_CTA_REASON_ID);
  assert.equal(noSlots.role, 'alert');
  assert.equal(noSlots.tone, 'danger');

  const overCapacity = getBookingV2Step1CtaState({
    slotsLoading: false,
    slotsCount: 2,
    guests: 6,
    selectedCapacityLeft: 4,
  });
  assert.equal(overCapacity.disabled, true);
  assert.equal(overCapacity.reason, '參加人數已超過此日期剩餘名額，請降低人數或選擇其他日期。');
  assert.equal(overCapacity.reasonId, BOOKING_V2_STEP1_CTA_REASON_ID);
  assert.equal(overCapacity.role, 'alert');
  assert.equal(overCapacity.tone, 'danger');
});

test('GH-1069: Step1 enabled has no disabled reason or accessibility linkage', () => {
  const state = getBookingV2Step1CtaState({
    slotsLoading: false,
    slotsCount: 2,
    guests: 2,
    selectedCapacityLeft: 4,
  });

  assert.equal(state.disabled, false);
  assert.equal(state.reason, '');
  assert.equal(state.reasonId, null);
  assert.equal(state.role, null);
  assert.equal(state.tone, null);
});

test('GH-1069: Step1 disabled states always include reason text + a11y reason id linkage', () => {
  const cases = [
    {
      input: { slotsLoading: true, slotsCount: 0, guests: 2, selectedCapacityLeft: 0 },
      expectedRole: 'status',
    },
    {
      input: { slotsLoading: false, slotsCount: 0, guests: 2, selectedCapacityLeft: 0 },
      expectedRole: 'alert',
    },
    {
      input: { slotsLoading: false, slotsCount: 2, guests: 6, selectedCapacityLeft: 4 },
      expectedRole: 'alert',
    },
  ];

  for (const testCase of cases) {
    const state = getBookingV2Step1CtaState(testCase.input);
    assert.equal(state.disabled, true);
    assert.equal(state.reasonId, BOOKING_V2_STEP1_CTA_REASON_ID);
    assert.equal(state.role, testCase.expectedRole);
    assert.equal(typeof state.reason, 'string');
    assert.equal(state.reason.length > 0, true);
  }
});

test('GH-1069: Step1 hard-block reason uses explicit red error color in booking shell', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = await readFile(path.join(__dirname, '../../app/booking/[activityId]/page.tsx'), 'utf8');

  assert.match(src, /color: step1CtaState\.tone === 'muted' \? 'var\(--tp-muted\)' : '#b42318'/);
  assert.match(src, /role=\{step1CtaState\.role \?\? undefined\}/);
  assert.match(src, /aria-describedby=\{step1CtaState\.disabled \? step1CtaState\.reasonId \?\? undefined : undefined\}/);
  assert.match(src, /data-testid="booking-v2-date-capacity-picker"/);
  assert.match(src, /entry\.state === 'available'\s*\? `\$\{entry\.date\}（剩餘 \$\{entry\.capacityLeft\}）`/);
  assert.doesNotMatch(src, /type="date"\s*\n\s*name="date"/);
});
