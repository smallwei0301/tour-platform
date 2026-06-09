import { test, expect } from './helpers';
import type { Page, Route } from '@playwright/test';

/**
 * Issue #1269 — Browser smoke for the post-#1268 (fix #1261) ECPay-only payment UI.
 *
 * Drives the real /booking page to Step 3 (付款確認) and asserts that the payment
 * step no longer exposes selectable LINE Pay / ATM radios and instead shows the
 * ECPay hand-off copy — matching the checkout contract (provider: 'ecpay' only).
 * Backend is mocked via page.route (no Supabase seed, no real payment mutation),
 * following e2e/issue1257-traveler-conflict-override-booking.spec.ts.
 */

const ACTIVITY_UUID = '1269aaaa-2222-4333-8444-555555555555';
const ACTIVITY_SLUG = 'orchid-island-snorkel-1269';
const PLAN_ID = 'plan-1269';
const DATE = '2030-05-10';
const SLOT_START = '2030-05-10T09:00:00+08:00';
const SLOT_END = '2030-05-10T12:00:00+08:00';

const ACTIVITY_RESPONSE = {
  ok: true,
  data: {
    id: ACTIVITY_UUID,
    slug: ACTIVITY_SLUG,
    title: '蘭嶼浮潛體驗',
    priceTwd: 2800,
    priceLabel: 'NT$2,800 / 人',
    durationDisplay: '約 3 小時',
    region: '台東',
    coverImageUrl: null,
    refundRules: [],
    minParticipants: 1,
    maxParticipants: 8,
    schedules: [],
    plans: [
      { id: PLAN_ID, slug: 'standard', status: 'active', name: '標準場', displayName: '標準場', basePrice: 2800, priceType: 'per_person', minParticipants: 1, maxParticipants: 8 },
    ],
    guide: { displayName: '阿德' },
  },
};

const SELECTED_PLAN = {
  id: PLAN_ID, name: '標準場', displayName: '標準場', basePrice: 2800,
  priceType: 'per_person', minParticipants: 1, maxParticipants: 8,
};

function availableSlotsBody() {
  const slot = { startAt: SLOT_START, endAt: SLOT_END, capacityLeft: 8, bookingType: 'instant', isAvailable: true, scheduleId: null, planId: PLAN_ID };
  return {
    success: true,
    data: {
      activityId: ACTIVITY_UUID, planId: PLAN_ID, timezone: 'Asia/Taipei', selectedPlan: SELECTED_PLAN, reason: '',
      dateAvailability: [{ date: DATE, state: 'available', capacityLeft: 8, reason: '', messageZh: '', selectedSlot: slot }],
      slots: [slot],
    },
  };
}

async function installRoutes(page: Page) {
  await page.route('**/api/activities/**', async (route: Route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() || '');
    if (id === ACTIVITY_SLUG) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACTIVITY_RESPONSE) }); return; }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'not found' } }) });
  });
  await page.route(`**/api/v2/activities/${ACTIVITY_UUID}/available-slots**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(availableSlotsBody()) });
  });
  await page.route('**/api/v2/bookings/draft', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { bookingId: '1269bbbb-cccc-4ddd-8eee-ffffffffffff' } }) });
  });
}

test.describe('GH-1269 — Booking V2 Step 3 is ECPay-only (no LINE Pay / ATM radios)', () => {
  test.describe.configure({ timeout: 90_000 });

  test('Step 3 shows ECPay hand-off copy and exposes no selectable LINE Pay / ATM payment options', async ({ page }) => {
    await installRoutes(page);
    await page.request.get(`/booking/${ACTIVITY_SLUG}?plan=${PLAN_ID}&date=${DATE}`, { failOnStatusCode: false, timeout: 60_000 });

    await page.goto(`/booking/${ACTIVITY_SLUG}?plan=${PLAN_ID}&date=${DATE}`, { waitUntil: 'commit', timeout: 60_000 });
    await expect(page.getByText('蘭嶼浮潛體驗').first()).toBeVisible({ timeout: 20_000 });

    // Step 1 → Step 2
    await expect(page.getByText(`${DATE}（可預約`)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /下一步：填寫資訊/ }).click();

    // Step 2 → Step 3 (create draft)
    await page.getByPlaceholder('請輸入真實姓名').fill('測試旅客');
    await page.getByPlaceholder('0912-345-678').fill('0912345678');
    await page.getByPlaceholder('you@example.com').fill('traveler@example.com');
    await page.locator('input[name="agreement"]').check();
    await page.getByRole('button', { name: /建立訂單並前往付款/ }).click();

    // Step 3 — payment confirmation
    await expect(page.getByText('付款確認（建立預約後）')).toBeVisible({ timeout: 20_000 });

    // ECPay hand-off copy present, accurate, Traditional Chinese.
    await expect(page.getByText('確認後將前往 ECPay 安全付款頁，實際可用付款方式以付款頁顯示為準。')).toBeVisible();
    await expect(page.getByText('付款由 ECPay 加密處理，資料不經本站')).toBeVisible();

    // No selectable LINE Pay / ATM payment options remain.
    await expect(page.locator('input[name="payment"]')).toHaveCount(0);
    await expect(page.getByText('LINE Pay')).toHaveCount(0);
    await expect(page.getByText('ATM 虛擬帳號')).toHaveCount(0);

    // Confirm CTA reflects the ECPay-only handoff (amount-bearing confirm button).
    await expect(page.getByRole('button', { name: /確認付款 NT\$/ })).toBeVisible();
  });
});
