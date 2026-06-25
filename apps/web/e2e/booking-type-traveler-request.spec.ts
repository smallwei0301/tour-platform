/**
 * 三種預約模式 — 旅客「申請預約（request）」流程 E2E。
 *
 * request plan 走「先審核後付款」：step 2 主按鈕為「送出預約申請」，送出後 step 3
 * 顯示「已送出預約申請（待審核）」而非 ECPay 付款表單。後端 draft 回傳
 * requiresApproval=true 驅動此分流。全程 mock backend（page.route），不依賴 Supabase。
 */
import { test, expect } from './helpers';
import type { Page, Route } from '@playwright/test';

const ACTIVITY_UUID = '11111111-2222-4333-8444-666666666666';
const ACTIVITY_SLUG = 'kaohsiung-chaishan-cave-experience';
const PLAN_ID = 'plan-request-uuid-0001';
const DATE = '2026-08-01';

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
    minParticipants: 1,
    maxParticipants: 8,
    schedules: [],
    plans: [
      {
        id: PLAN_ID,
        slug: 'request-plan',
        status: 'active',
        name: '申請制深度探洞',
        displayName: '申請制深度探洞',
        basePrice: 2500,
        priceType: 'per_person',
        minParticipants: 1,
        maxParticipants: 8,
      },
    ],
    guide: { displayName: '王小明' },
  },
};

const SLOT = {
  startAt: '2026-08-01T06:00:00.000Z',
  endAt: '2026-08-01T10:00:00.000Z',
  capacityLeft: 8,
  bookingType: 'request',
  isAvailable: true,
  scheduleId: null,
  planId: PLAN_ID,
};

const AVAILABLE_SLOTS_SUCCESS = {
  success: true,
  data: {
    activityId: ACTIVITY_UUID,
    planId: PLAN_ID,
    selectedPlan: {
      id: PLAN_ID,
      name: '申請制深度探洞',
      displayName: '申請制深度探洞',
      basePrice: 2500,
      priceType: 'per_person',
      minParticipants: 1,
      maxParticipants: 8,
      bookingType: 'request',
    },
    reason: '',
    dateAvailability: [
      { date: DATE, state: 'available', capacityLeft: 8, reason: '', messageZh: '', selectedSlot: SLOT },
    ],
    slots: [SLOT],
  },
};

async function installRoutes(page: Page) {
  await page.route('**/api/activities/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const identifier = decodeURIComponent(url.pathname.split('/').pop() || '');
    if (identifier === ACTIVITY_SLUG || identifier === ACTIVITY_UUID) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACTIVITY_RESPONSE) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
  });
  await page.route(`**/api/v2/activities/${ACTIVITY_UUID}/available-slots**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(AVAILABLE_SLOTS_SUCCESS) });
  });
}

test.describe('三種預約模式 — 旅客 request 流程', () => {
  test.describe.configure({ timeout: 90_000 });

  test('request plan：送出申請而非付款，step 3 顯示審核中', async ({ page }) => {
    await installRoutes(page);

    let draftCalled = false;
    await page.route('**/api/v2/bookings/draft', async (route: Route) => {
      draftCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            bookingId: 'bk-request-e2e',
            bookingNo: 'BK-REQ-1',
            bookingStatus: 'draft',
            orderId: 'order-req-e2e',
            orderStatus: 'pending_payment',
            amount: 2500,
            currency: 'TWD',
            bookingType: 'request',
            requiresApproval: true,
          },
        }),
      });
    });
    // checkout must NOT be hit in request flow
    let checkoutCalled = false;
    await page.route('**/api/v2/bookings/*/checkout', async (route: Route) => {
      checkoutCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
    });

    await page.request.get(`/booking/${ACTIVITY_SLUG}?plan=${PLAN_ID}&date=${DATE}`, { failOnStatusCode: false, timeout: 60_000 });
    await page.goto(`/booking/${ACTIVITY_SLUG}?plan=${PLAN_ID}&date=${DATE}`, { waitUntil: 'commit', timeout: 60_000 });

    await expect(page.getByText('高雄柴山探洞體驗').first()).toBeVisible({ timeout: 20_000 });

    // Step 1 → Step 2
    await page.getByRole('button', { name: /下一步：填寫資訊/ }).click();

    // Step 2: request hint + button label
    await expect(page.getByTestId('booking-request-hint')).toBeVisible();
    await page.fill('input[name="contactName"]', '測試旅客');
    await page.fill('input[name="contactPhone"]', '0912345678');
    await page.fill('input[name="contactEmail"]', 'req@example.com');
    await page.check('input[name="agreement"]');

    const submitBtn = page.getByRole('button', { name: /送出預約申請/ });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Step 3: application submitted state (no payment UI)
    await expect(page.getByTestId('booking-request-submitted')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('已送出預約申請')).toBeVisible();
    await expect(page.getByText('確認付款', { exact: false })).toHaveCount(0);

    expect(draftCalled).toBe(true);
    expect(checkoutCalled).toBe(false);
  });
});
