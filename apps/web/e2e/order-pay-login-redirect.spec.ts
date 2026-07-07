import { test, expect } from '@playwright/test';

test.describe('Order pay login redirect continuity', () => {
  test('guest user from /order/pay should be redirected to /login with redirectTo', async ({ page }) => {
    const orderId = '5307354b-a78e-42f1-bb62-11d6d3f86154';

    await page.goto(`/order/pay?orderId=${orderId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('需要先登入')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: '前往登入' }).click();

    // 修正（#1649 QA）：template literal 的 `\?` 會被 JS 字串層吃掉反斜線，
    // regex 變成 `login?redirectTo`（n 成為 optional、`?` 字面遺失）→ 永不匹配。
    await expect(page).toHaveURL(new RegExp(`/login\\?redirectTo=.*orderId%3D${orderId}`));
  });
});
