import { test, expect } from './helpers';
import type { Page, Route } from '@playwright/test';

const ACTIVITY_UUID = '11111111-2222-4333-8444-555555555555';
const ACTIVITY_SLUG = 'kaohsiung-chaishan-cave-experience';
const PLAN_ID = 'plan-formal-uuid-1237';
const DATE = '2026-07-01';

const ACTIVITY_RESPONSE = {
  ok: true,
  data: {
    id: ACTIVITY_UUID,
    slug: ACTIVITY_SLUG,
    title: '高雄柴山探洞體驗',
    priceTwd: 2500,
    priceLabel: 'NT$2,500 / 人',
    durationDisplay: '約 4 小時',
    region: '高雄',
    coverImageUrl: null,
    refundRules: [],
    minParticipants: 2,
    maxParticipants: 8,
    schedules: [
      {
        id: 'schedule-1237',
        startAt: '2026-07-01T06:00:00.000Z',
        endAt: '2026-07-01T10:00:00.000Z',
        capacity: 8,
        bookedCount: 0,
        status: 'open',
        planId: PLAN_ID,
      },
    ],
    plans: [
      {
        id: PLAN_ID,
        slug: 'half-day',
        status: 'active',
        name: '半日探洞',
        displayName: '半日探洞',
        basePrice: 2500,
        priceType: 'per_person',
        minParticipants: 2,
        maxParticipants: 8,
      },
    ],
    guide: { displayName: '王小明' },
  },
};

const AVAILABLE_SLOTS_SUCCESS = {
  success: true,
  data: {
    activityId: ACTIVITY_UUID,
    planId: PLAN_ID,
    selectedPlan: {
      id: PLAN_ID,
      name: '半日探洞',
      displayName: '半日探洞',
      basePrice: 2500,
      priceType: 'per_person',
      minParticipants: 2,
      maxParticipants: 8,
    },
    reason: '',
    dateAvailability: [
      {
        date: DATE,
        state: 'available',
        capacityLeft: 8,
        selectedSlot: {
          startAt: '2026-07-01T06:00:00.000Z',
          endAt: '2026-07-01T10:00:00.000Z',
          capacityLeft: 8,
          bookingType: 'instant',
          isAvailable: true,
          scheduleId: 'schedule-1237',
          planId: PLAN_ID,
        },
      },
    ],
    slots: [
      {
        startAt: '2026-07-01T06:00:00.000Z',
        endAt: '2026-07-01T10:00:00.000Z',
        capacityLeft: 8,
        bookingType: 'instant',
        isAvailable: true,
        scheduleId: 'schedule-1237',
        planId: PLAN_ID,
      },
    ],
  },
};

async function warmBookingRoute(
  page: Page,
  {
    identifier = ACTIVITY_SLUG,
    planId = PLAN_ID,
    date = DATE,
  }: { identifier?: string; planId?: string; date?: string } = {},
) {
  await page.request.get(`/booking/${identifier}?plan=${planId}&date=${date}`, {
    failOnStatusCode: false,
    timeout: 60_000,
  });
}

async function installBookingRoutes(page: Page) {
  await page.route('**/api/activities/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const identifier = decodeURIComponent(url.pathname.split('/').pop() || '');
    if (identifier === ACTIVITY_UUID) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { message: 'activity not found' } }),
      });
      return;
    }
    if (identifier === ACTIVITY_SLUG) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ACTIVITY_RESPONSE),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { message: 'unexpected activity lookup' } }),
    });
  });

  await page.route('**/api/activities', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: ACTIVITY_UUID,
            slug: ACTIVITY_SLUG,
            region: '高雄',
            title: '高雄柴山探洞體驗',
          },
        ],
      }),
    });
  });

  await page.route(`**/api/v2/activities/${ACTIVITY_UUID}/available-slots**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AVAILABLE_SLOTS_SUCCESS),
    });
  });
}

test.describe('GH-1237 — Booking V2 UUID entry + missing-plan recovery', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UUID booking URL resolves to canonical slug booking path', async ({ page }) => {
    await installBookingRoutes(page);
    await warmBookingRoute(page, { identifier: ACTIVITY_UUID });

    await page.goto(`/booking/${ACTIVITY_UUID}?plan=${PLAN_ID}&date=${DATE}`, {
      waitUntil: 'commit',
      timeout: 60_000,
    });

    await expect(page.getByText('高雄柴山探洞體驗').first()).toBeVisible({ timeout: 20_000 });
    expect(page.url()).toContain(`/booking/${ACTIVITY_SLUG}?plan=${PLAN_ID}&date=${DATE}`);
    await expect(page.getByText('半日探洞')).toBeVisible();
  });

  test('slug booking URL keeps working for existing public activity', async ({ page }) => {
    await installBookingRoutes(page);
    await warmBookingRoute(page, { identifier: ACTIVITY_SLUG });

    await page.goto(`/booking/${ACTIVITY_SLUG}?plan=${PLAN_ID}&date=${DATE}`, {
      waitUntil: 'commit',
      timeout: 60_000,
    });

    await expect(page.getByText('高雄柴山探洞體驗').first()).toBeVisible({ timeout: 20_000 });
    expect(page.url()).toContain(`/booking/${ACTIVITY_SLUG}?plan=${PLAN_ID}&date=${DATE}`);
  });

  test('missing/unresolvable plan shows Traditional Chinese recovery copy and a plan-picker CTA', async ({ page }) => {
    await installBookingRoutes(page);
    await warmBookingRoute(page, { identifier: ACTIVITY_SLUG, planId: 'legacy-plan' });

    await page.route(`**/api/v2/activities/${ACTIVITY_UUID}/available-slots**`, async (route: Route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            message: 'Activity plan not found',
          },
          data: {
            reason: 'PLAN_NOT_FOUND',
          },
        }),
      });
    });

    await page.goto(`/booking/${ACTIVITY_SLUG}?plan=legacy-plan&date=${DATE}`, {
      waitUntil: 'commit',
      timeout: 60_000,
    });

    await expect(page.getByTestId('booking-v2-error')).toContainText('找不到此方案，請回到行程頁重新選擇。', { timeout: 20_000 });
    await expect(page.getByTestId('booking-v2-error')).not.toContainText('Activity plan not found');
    await expect(page.getByTestId('booking-v2-recovery-link')).toHaveAttribute(
      'href',
      `/activities/%E9%AB%98%E9%9B%84/${ACTIVITY_SLUG}#section-plan`,
    );
  });
});
