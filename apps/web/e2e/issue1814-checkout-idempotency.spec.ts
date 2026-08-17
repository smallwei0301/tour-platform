import { expect, setTravelerSession, test } from './helpers';

const ACTIVITY_ID = '18140000-0000-4000-8000-000000000002';
const PLAN_ID = '18140000-0000-4000-8000-000000000003';
const ADDON_ID = '18140000-0000-4000-8000-000000000004';
const DATE = '2030-07-05';

async function stubDraftIntent(page: import('@playwright/test').Page) {
  await page.route('**/api/activities/issue1814-fixture**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {
      id: ACTIVITY_ID, slug: 'issue1814-fixture', title: '冪等測試行程', region: 'taipei', priceTwd: 1000,
      maxParticipants: 8, minParticipants: 1, refundRules: [], schedules: [], plans: [{
        id: PLAN_ID, slug: 'default', label: '標準方案', duration: '120 分鐘', price: 1000,
        minParticipants: 1, maxParticipants: 8,
      }],
    } }),
  }));
  await page.route(`**/api/v2/activities/${ACTIVITY_ID}/available-slots**`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {
      activityId: ACTIVITY_ID, planId: PLAN_ID,
      selectedPlan: { id: PLAN_ID, name: '標準方案', priceType: 'per_person', basePrice: 1000, minParticipants: 1, maxParticipants: 8, bookingType: 'scheduled' },
      slots: [
        { startAt: `${DATE}T01:00:00.000Z`, endAt: `${DATE}T03:00:00.000Z`, capacityLeft: 8, bookingType: 'scheduled', isAvailable: true, scheduleId: 'issue1814-schedule-a' },
        { startAt: `${DATE}T04:00:00.000Z`, endAt: `${DATE}T06:00:00.000Z`, capacityLeft: 8, bookingType: 'scheduled', isAvailable: true, scheduleId: 'issue1814-schedule-b' },
      ],
      dateAvailability: [{ date: DATE, state: 'available', capacityLeft: 8, firstAvailableStartAt: `${DATE}T01:00:00.000Z` }],
    } }),
  }));
  await page.route('**/api/me/wishlist/ids', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
}

async function stubCheckoutExtras(page: import('@playwright/test').Page) {
  await page.route(`**/api/v2/activities/${ACTIVITY_ID}/addons`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items: [
      { id: ADDON_ID, name: '測試午餐', priceTwd: 100, unit: 'per_person', stock: 8, isActive: true },
    ] } }),
  }));
  await page.route('**/api/me/points', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: { balance: 1000 } }),
  }));
}

test('#1814 browser: transport retry keeps a key, while a changed scheduled slot gets a new key', async ({ page }) => {
  await stubDraftIntent(page);
  const keys: string[] = [];
  await page.route('**/api/v2/bookings/draft', async (route) => {
    keys.push(route.request().headers()['idempotency-key'] ?? '');
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'temporary failure' } }) });
  });
  await page.goto(`/booking/issue1814-fixture?plan=${PLAN_ID}&date=${DATE}`);
  await expect(page.getByTestId('traveler-slot-option')).toHaveCount(2);
  await page.getByTestId('traveler-slot-option').nth(0).click();
  await page.getByRole('button', { name: /下一步：填寫資訊/ }).click();
  await page.getByPlaceholder('請輸入真實姓名').fill('測試旅客');
  await page.getByPlaceholder('0912-345-678').fill('0912345678');
  await page.getByPlaceholder('you@example.com').fill('issue1814@example.com');
  await page.locator('input[name="agreement"]').check();
  const submit = page.getByRole('button', { name: /建立訂單並前往付款/ });
  await submit.click();
  await expect.poll(() => keys.length).toBe(1);
  await submit.click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[1]).toBe(keys[0]);
  await page.getByRole('button', { name: /上一步/ }).click();
  await page.getByTestId('traveler-slot-option').nth(1).click();
  await page.getByRole('button', { name: /下一步：填寫資訊/ }).click();
  await expect(submit).toBeVisible();
  await submit.click();
  await expect.poll(() => keys.length).toBe(3);
  expect(keys[2]).not.toBe(keys[0]);
});

test('#1815 browser: selected add-on and points are sent together, and a rejected checkout stays editable', async ({ page }) => {
  await setTravelerSession(page);
  await stubDraftIntent(page);
  await stubCheckoutExtras(page);
  let draftBody: Record<string, unknown> | null = null;
  await page.route('**/api/v2/bookings/draft', async (route) => {
    draftBody = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 400, contentType: 'application/json', body: JSON.stringify({
        success: false,
        error: { code: 'ADDON_UNAVAILABLE', messageZh: '所選加購目前無法使用，請重新選擇' },
      }),
    });
  });

  await page.goto(`/booking/issue1814-fixture?plan=${PLAN_ID}&date=${DATE}`);
  await page.getByTestId('traveler-slot-option').first().click();
  await page.getByRole('button', { name: /下一步：填寫資訊/ }).click();
  await expect(page.getByTestId('checkout-addons')).toBeVisible();
  await page.getByRole('button', { name: '增加 測試午餐' }).click();
  await page.getByTestId('points-redeem-toggle').check();
  await page.getByPlaceholder('請輸入真實姓名').fill('測試旅客');
  await page.getByPlaceholder('0912-345-678').fill('0912345678');
  await page.getByPlaceholder('you@example.com').fill('issue1815@example.com');
  await page.locator('input[name="agreement"]').check();
  await page.getByRole('button', { name: /建立訂單並前往付款/ }).click();

  await expect.poll(() => draftBody).not.toBeNull();
  expect(draftBody).toMatchObject({
    addonSelections: [{ addonId: ADDON_ID, quantity: 1 }],
    redeemPoints: 330,
  });
  await expect(page.getByText('所選加購目前無法使用，請重新選擇')).toBeVisible();
  await expect(page.getByTestId('checkout-addons')).toBeVisible();
  await expect(page.getByTestId('points-redeem-toggle')).toBeChecked();
});

test('#1815 browser: payment page shows the persisted amount and exposes a materialization guard error', async ({ page }) => {
  await setTravelerSession(page);
  const orderId = '18150000-0000-4000-8000-000000000001';
  await page.route(`**/api/v2/orders/${orderId}**`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
      id: orderId, status: 'pending_payment', totalTwd: 6900, title: '付款閘門測試行程', peopleCount: 2,
      contactName: '測試旅客', contactEmail: 'issue1815@example.com',
    } }),
  }));
  let paymentCalls = 0;
  await page.route('**/api/v2/payments/ecpay/create', (route) => {
    paymentCalls += 1;
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({
      error: { code: 'ORDER_NOT_MATERIALIZED', message: '訂單尚未完成，暫時無法付款' },
    }) });
  });

  await page.goto(`/order/pay?orderId=${orderId}`);
  await expect(page.getByText('NT$ 6,900')).toBeVisible();
  await page.getByTestId('ecpay-pay-btn').click();
  await expect.poll(() => paymentCalls).toBe(1);
  await expect(page.getByText('訂單尚未完成，暫時無法付款')).toBeVisible();
  await expect(page.getByTestId('ecpay-pay-btn')).toBeEnabled();
});
