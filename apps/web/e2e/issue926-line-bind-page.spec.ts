import { test, expect } from '@playwright/test';

/**
 * `/line/bind` 一鍵綁定頁（#926）。dev server 未設 NEXT_PUBLIC_LINE_LIFF_ENABLED
 * → 旗標 OFF → 頁面顯示「綁定碼退路」並連到 /me/profile。LIFF-ON 的免碼路徑需真實
 * LINE 環境，改由 source-contract（tests/api/line-bind-liff-contract）鎖定。
 */
test.describe('/line/bind 綁定頁（#926）', () => {
  test('LIFF 旗標 OFF：顯示綁定碼退路並連到 /me/profile', async ({ page }) => {
    await page.goto('/line/bind');
    await expect(page.getByRole('heading', { name: '綁定 LINE 訂單通知' })).toBeVisible();
    const link = page.getByRole('link', { name: '前往我的帳號' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /\/me\/profile/);
  });
});
