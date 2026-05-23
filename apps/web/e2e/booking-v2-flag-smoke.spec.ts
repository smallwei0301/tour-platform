import { test, expect } from '@playwright/test';

const BOOKING_URL = '/booking/kaohsiung-chaishan-cave-experience?plan=half-day&date=2026-04-20';

test.describe('Booking V2 flag-on smoke', () => {
  test('shows v2 error and allows fallback to legacy flow when v2 slots API fails', async ({ page }) => {
    await page.route('**/api/v2/activities/*/available-slots**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'slots service unavailable (e2e simulated)' },
        }),
      });
    });

    await page.goto(BOOKING_URL);

    // If flag is off in runtime environment, skip this smoke (B2 flag gate not active).
    const isV2 = await page.getByText('（V2 預約流程）').isVisible().catch(() => false);
    test.skip(!isV2, 'Booking V2 flag is off in this runtime; skip flag-on smoke.');

    await expect(page.getByTestId('booking-v2-error')).toBeVisible();
    await expect(page.getByTestId('booking-v2-error')).toContainText('slots service unavailable');

    await page.getByTestId('booking-v2-fallback-btn').first().click();
    await expect(page.getByText('（V2 預約流程）')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /下一步：填寫資訊|下一步.*填寫資訊/i })).toBeVisible();
  });
});
