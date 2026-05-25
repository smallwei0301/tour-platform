import { test, expect } from '@playwright/test';

const BOOKING_URL = '/booking/kaohsiung-chaishan-cave-experience?plan=half-day&date=2026-04-20';
const RESOLVED_ACTIVITY_ID = '11111111-1111-1111-1111-111111111111';
const RESOLVED_PLAN_ID = '22222222-2222-2222-2222-222222222222';
const EARLIEST_START_AT = '2026-04-20T01:00:00.000Z';

test.describe('Booking V2 legacy-UI smoke', () => {
  test('renders legacy-style flow and keeps available-slots -> draft -> checkout only', async ({ page }) => {
    let draftPayload: any = null;
    let checkoutPayload: any = null;
    let legacyEndpointCalled = false;

    await page.route('**/api/v2/activities/*/available-slots**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            activityId: RESOLVED_ACTIVITY_ID,
            planId: RESOLVED_PLAN_ID,
            slots: [
              { startAt: EARLIEST_START_AT, isAvailable: true, capacityLeft: 7 },
              { startAt: '2026-04-20T03:00:00.000Z', isAvailable: true, capacityLeft: 5 },
            ],
          },
        }),
      });
    });

    await page.route('**/api/v2/bookings/draft', async (route) => {
      draftPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { bookingId: 'bk_test_001' } }),
      });
    });

    await page.route('**/api/v2/bookings/*/checkout', async (route) => {
      checkoutPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            paymentFormHtml:
              '<form action="about:blank" method="post"><input type="hidden" name="TradeNo" value="MOCK-001" /></form>',
          },
        }),
      });
    });

    await page.route('**/api/orders**', async (route) => {
      legacyEndpointCalled = true;
      await route.abort();
    });
    await page.route('**/api/payments/mock-confirm**', async (route) => {
      legacyEndpointCalled = true;
      await route.abort();
    });

    await page.goto(BOOKING_URL);

    const hasV2EnabledPath = await page.getByText('行程確認').first().isVisible().catch(() => false);
    test.skip(!hasV2EnabledPath, 'Booking V2 flag is off in this runtime; skip flag-on smoke.');

    await expect(page.getByText('（V2 預約流程）')).toHaveCount(0);
    await expect(page.getByText('行程確認')).toBeVisible();
    await expect(page.getByText('旅客資訊')).toBeVisible();
    await expect(page.getByText('付款')).toBeVisible();
    await expect(page.getByRole('button', { name: '下一步：填寫資訊 →' })).toBeVisible();

    await page.getByRole('button', { name: '下一步：填寫資訊 →' }).click();

    await page.getByLabel('聯絡人姓名').fill('王小明');
    await page.getByLabel('電話').fill('0912345678');
    await page.getByLabel('Email').fill('demo@example.com');
    await page.getByLabel('備註（選填）').fill('E2E smoke');
    await page.getByRole('checkbox', { name: '我已閱讀並同意取消與退款條款' }).check();

    await page.getByRole('button', { name: '下一步：付款 →' }).click();
    await page.getByRole('button', { name: '確認並前往付款' }).click();

    await expect.poll(() => !!draftPayload).toBe(true);
    await expect.poll(() => !!checkoutPayload).toBe(true);

    expect(draftPayload.activityId).toBe(RESOLVED_ACTIVITY_ID);
    expect(draftPayload.planId).toBe(RESOLVED_PLAN_ID);
    expect(draftPayload.startAt).toBe(EARLIEST_START_AT);
    expect(draftPayload.participants).toBeGreaterThanOrEqual(1);
    expect(draftPayload.contactName).toBeTruthy();
    expect(draftPayload.contactPhone).toBeTruthy();
    expect(draftPayload.contactEmail).toBeTruthy();

    expect(checkoutPayload.provider).toBe('ecpay');
    expect(legacyEndpointCalled).toBe(false);
  });
});
