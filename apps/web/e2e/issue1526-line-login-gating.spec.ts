import { test, expect } from '@playwright/test';

/**
 * Issue #1526 — LINE Login 按鈕 flag gating（前端可驗部分）。
 *
 * flag `NEXT_PUBLIC_LINE_LOGIN_ENABLED` 於 build 時 inline 進 client bundle，
 * dev server 未設該 env（預設 OFF）→ 登入頁不得出現 LINE 按鈕，Google 按鈕仍在。
 *
 * 完整 LINE OAuth 全鏈（authorize→callback→session）需真實 LINE channel，
 * 標 NOT_AUTOMATABLE（見 docs/operations/line-login-setup.md）；此處只驗 flag OFF
 * 的預設安全行為（不影響 Google 登入）。
 */
test.describe('issue1526 — LINE Login 按鈕 flag gating', () => {
  test('flag OFF（預設）→ 登入頁只有 Google 按鈕、無 LINE 按鈕', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('google-login-btn')).toBeVisible();
    await expect(page.getByTestId('line-login-btn')).toHaveCount(0);
  });
});
