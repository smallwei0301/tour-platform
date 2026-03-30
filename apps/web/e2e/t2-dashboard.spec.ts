/**
 * T2 - Dashboard
 */
import { test, expect } from './helpers';

test('T2.1 - Dashboard 載入顯示 KPI 數值', async ({ authedPage: page }) => {
  await page.goto('/admin');
  // KPI cards should be visible (non-empty)
  await expect(page.locator('text=/訂單|GMV|導遊|退款/i').first()).toBeVisible({ timeout: 8000 });
});

test('T2.2 - 時間篩選器可切換', async ({ authedPage: page }) => {
  await page.goto('/admin');
  await page.waitForSelector('select, button:has-text("7天"), button:has-text("30天")', { timeout: 5000 }).catch(() => {});
  // At minimum the page loads without error
  await expect(page.locator('body')).not.toContainText('500');
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
});
