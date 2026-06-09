import { test, expect, setGuideSession } from './helpers';
import type { Page, Route } from '@playwright/test';

/**
 * Issue #1294 — Browser smoke for post-#1291 (GH-1289) Booking V2 slot-range
 * semantics across the guide availability surface and the traveler picker.
 *
 * Covers:
 *   AC1 — new-rule flow defaults slot_interval_minutes from the selected plan's
 *         durationMinutes (until the guide edits it manually).
 *   AC2 — guide preview chips show the FULL range via formatSlotRangeLabel
 *         (e.g. 09:00 – 15:00), not start-only, and no #1288 TZ-shift symptom.
 *   AC3 — existing-rule duration/interval mismatch warning is visible and does
 *         not block editing.
 *   AC4 — traveler booking picker shows the same canonical range label.
 *
 * Backend mocked via page.route (no Supabase seed). Guide surface uses a
 * format-valid guide session (helpers.setGuideSession); the real HMAC API is
 * never hit.
 */

test.describe.configure({ timeout: 90_000 });

const GUIDE_ID = '1294aaaa-1111-4111-8111-111111111111';
const ACTIVITY_ID = '1294bbbb-2222-4222-8222-222222222222';
const PLAN_ID = '1294cccc-3333-4333-8333-333333333333';
const PLAN_DURATION = 360; // 全日方案 6h

const ACTIVITIES_WITH_PLANS = {
  ok: true,
  data: [
    {
      activityId: ACTIVITY_ID,
      activityTitle: '海岸獨木舟全日',
      planId: PLAN_ID,
      planName: '全日方案',
      durationMinutes: PLAN_DURATION,
      minParticipants: 1,
      maxParticipants: 8,
      isYearRound: true,
      activeSeasonSummaries: [],
    },
  ],
};

function existingRule(intervalMinutes: number) {
  return {
    id: 'rule-1294-1',
    activity_plan_id: PLAN_ID,
    weekday: 1,
    start_time_local: '09:00',
    end_time_local: '15:00',
    timezone: 'Asia/Taipei',
    slot_interval_minutes: intervalMinutes,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    effective_from: null,
    effective_to: null,
    is_active: true,
    use_dynamic_reemit: false,
  };
}

function previewBody(slots: Array<{ startAt: string; endAt: string }>) {
  return {
    ok: true,
    data: {
      availabilitySource: 'canonical_generate_available_slots',
      previewCanonicalState: 'available',
      isYearRound: true,
      activeSeasonSummaries: [],
      slots: slots.map((s) => ({ ...s, isAvailable: true, minParticipants: null })),
    },
  };
}

async function installGuideRoutes(
  page: Page,
  opts: { rules?: unknown[]; preview?: Array<{ startAt: string; endAt: string }> } = {},
) {
  await page.route('**/api/guide/auth/csrf', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { csrfToken: 'test-csrf' } }) }),
  );
  await page.route('**/api/guide/availability-rules', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { rules: opts.rules ?? [] } }) }),
  );
  await page.route('**/api/guide/blackout-dates', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { blackouts: [] } }) }),
  );
  await page.route('**/api/guide/activities-with-plans', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACTIVITIES_WITH_PLANS) }),
  );
  await page.route('**/api/guide/availability-preview**', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(previewBody(opts.preview ?? [])) }),
  );
}

test('AC1 — new rule defaults slot interval from the selected plan duration', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await installGuideRoutes(page);

  await page.goto('/guide/availability');
  await page.waitForLoadState('domcontentloaded');

  await page.getByRole('button', { name: '+ 新增時段' }).click();
  const dialog = page.getByRole('dialog', { name: '新增時段規則' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('活動').selectOption(ACTIVITY_ID);
  await dialog.getByLabel('方案').selectOption(PLAN_ID);

  // Interval auto-defaults to the plan's duration (360), not the initial 60.
  await expect(page.locator('#avail-interval-minutes')).toHaveValue(String(PLAN_DURATION));
});

test('AC2 — guide preview shows full slot range via formatSlotRangeLabel (no TZ shift)', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await installGuideRoutes(page, {
    preview: [{ startAt: '2030-05-13T09:00:00+08:00', endAt: '2030-05-13T15:00:00+08:00' }],
  });

  await page.goto('/guide/availability');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByText('09:00 – 15:00').first()).toBeVisible({ timeout: 20_000 });
  // #1288 timezone-shift symptom must not appear for a 09:00-based rule.
  await expect(page.getByText('17:00 – 00:00')).toHaveCount(0);
});

test('AC3 — existing-rule duration/interval mismatch warning is visible and non-blocking', async ({ page }) => {
  await setGuideSession(page, GUIDE_ID);
  await installGuideRoutes(page, { rules: [existingRule(60)] }); // interval 60 ≠ plan duration 360

  await page.goto('/guide/availability');
  await page.waitForLoadState('domcontentloaded');

  await page.getByRole('button', { name: '編輯' }).first().click();
  const dialog = page.getByRole('dialog', { name: '編輯時段規則' });
  await expect(dialog).toBeVisible();

  await expect(dialog.getByText(/時段間隔（60 分鐘）與方案時長（360 分鐘）不一致/)).toBeVisible();
  // Non-blocking: the interval field stays editable and the save CTA is present.
  await expect(page.locator('#avail-interval-minutes')).toBeEditable();
  await expect(dialog.getByRole('button', { name: '儲存' })).toBeVisible();
});

test('AC4 — traveler booking picker shows the same canonical range label', async ({ page }) => {
  const ACT_UUID = '1294dddd-4444-4444-8444-444444444444';
  const ACT_SLUG = 'kayak-fullday-1294';
  const TPLAN = 'plan-1294-trav';
  const DATE = '2030-05-13';
  await page.route('**/api/activities/**', (r: Route) => {
    const id = decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop() || '');
    if (id === ACT_SLUG) {
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            id: ACT_UUID, slug: ACT_SLUG, title: '海岸獨木舟全日', priceTwd: 3600, priceLabel: 'NT$3,600 / 人',
            durationDisplay: '約 6 小時', region: '台東', coverImageUrl: null, refundRules: [], minParticipants: 1, maxParticipants: 8,
            schedules: [], plans: [{ id: TPLAN, slug: 'full', status: 'active', name: '全日方案', displayName: '全日方案', basePrice: 3600, priceType: 'per_person', minParticipants: 1, maxParticipants: 8 }],
            guide: { displayName: '阿德' },
          },
        }),
      });
    }
    return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'nf' } }) });
  });
  await page.route(`**/api/v2/activities/${ACT_UUID}/available-slots**`, (r: Route) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          activityId: ACT_UUID, planId: TPLAN, timezone: 'Asia/Taipei',
          selectedPlan: { id: TPLAN, name: '全日方案', displayName: '全日方案', basePrice: 3600, priceType: 'per_person', minParticipants: 1, maxParticipants: 8 },
          reason: '',
          dateAvailability: [{ date: DATE, state: 'available', capacityLeft: 8, reason: '', messageZh: '', selectedSlot: { startAt: '2030-05-13T09:00:00+08:00', endAt: '2030-05-13T15:00:00+08:00', capacityLeft: 8, bookingType: 'instant', isAvailable: true, scheduleId: null, planId: TPLAN } }],
          slots: [{ startAt: '2030-05-13T09:00:00+08:00', endAt: '2030-05-13T15:00:00+08:00', capacityLeft: 8, bookingType: 'instant', isAvailable: true, scheduleId: null, planId: TPLAN }],
        },
      }),
    }),
  );

  await page.request.get(`/booking/${ACT_SLUG}?plan=${TPLAN}&date=${DATE}`, { failOnStatusCode: false, timeout: 60_000 });
  await page.goto(`/booking/${ACT_SLUG}?plan=${TPLAN}&date=${DATE}`, { waitUntil: 'commit', timeout: 60_000 });
  await expect(page.getByText('海岸獨木舟全日').first()).toBeVisible({ timeout: 20_000 });

  // Same canonical range label as the guide preview.
  await expect(page.getByText('09:00 – 15:00').first()).toBeVisible({ timeout: 20_000 });
});
