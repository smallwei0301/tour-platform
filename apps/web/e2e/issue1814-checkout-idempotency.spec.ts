import { expect, test } from '@playwright/test';

const ACTIVITY_ID = '18140000-0000-4000-8000-000000000002';
const PLAN_ID = '18140000-0000-4000-8000-000000000003';
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
