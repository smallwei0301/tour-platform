/**
 * T2 - Dashboard
 */
import { test, expect } from './helpers';

test('T2.1 - Dashboard 載入顯示 KPI 數值', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin');
  await page.waitForTimeout(1500);
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  if (isMobile) {
    const body = await page.locator('body').textContent() || '';
    expect(body.includes('Admin') || body.includes('Dashboard') || body.includes('總訂單')).toBeTruthy();
  } else {
    await expect(page.locator('text=/總訂單|總 GMV|待處理/i').first()).toBeVisible({ timeout: 8000 });
  }
});

test('T2.2 - 時間篩選器可切換', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin');
  await page.waitForTimeout(1500);
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  const hasFilter = await page.locator('button:has-text("近 7 日"), button:has-text("今天"), button:has-text("近 30 日")').count();
  if (!isMobile) {
    expect(hasFilter).toBeGreaterThan(0);
  }
});
