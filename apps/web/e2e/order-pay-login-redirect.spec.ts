import { test, expect } from '@playwright/test';

test.describe('Order pay login redirect continuity', () => {
  test('guest user from /order/pay should be redirected to /login with redirectTo', async ({ page }) => {
    const orderId = '5307354b-a78e-42f1-bb62-11d6d3f86154';

    await page.goto(`/order/pay?orderId=${orderId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('需要先登入')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: '前往登入' }).click();

    await expect(page).toHaveURL(new RegExp(`/login\?redirectTo=.*orderId%3D${orderId}`));
  });
});
