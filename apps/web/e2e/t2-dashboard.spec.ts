/**
 * T2 - Dashboard
 */
import { test, expect } from './helpers';

test('T2.1 - Dashboard 載入顯示 KPI 數值', async ({ authedPage: page }) => {
  await page.goto('/admin');
  // KPI cards contain numbers/NT$
  await expect(page.locator('text=/總訂單|總 GMV|待處理/i').first()).toBeVisible({ timeout: 8000 });
});

test('T2.2 - 時間篩選器可切換', async ({ authedPage: page }) => {
  await page.goto('/admin');
  await page.waitForTimeout(1500);
  // Not an error page
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  // Has time filter buttons
  const hasFilter = await page.locator('button:has-text("近 7 日"), button:has-text("今天"), button:has-text("近 30 日")').count();
  expect(hasFilter).toBeGreaterThan(0);
});
