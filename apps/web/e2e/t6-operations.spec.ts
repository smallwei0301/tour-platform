/**
 * T6 - 操作追蹤
 */
import { test, expect } from './helpers';

test('T6.1 - 頁面載入顯示 KPI 摘要', async ({ authedPage: page }) => {
  await page.goto('/admin/operations-tracking');
  await expect(page.locator('text=/GMV|總收入|健康訂單/i').first()).toBeVisible({ timeout: 8000 });
});

test('T6.2 - 點擊訂單顯示編輯面板', async ({ authedPage: page }) => {
  await page.goto('/admin/operations-tracking');
  await page.locator('table tbody tr').first().click();
  await expect(page.locator('text=/編輯營運欄位/i')).toBeVisible({ timeout: 5000 });
});

test('T6.3 - 修改人工時間並儲存', async ({ authedPage: page }) => {
  await page.goto('/admin/operations-tracking');
  await page.locator('table tbody tr').first().click();
  await page.waitForSelector('button:has-text("儲存變更")', { timeout: 5000 });
  // Find manualMinutes input and update it
  const inputs = page.locator('input[type="number"]');
  if (await inputs.count() > 0) {
    await inputs.first().fill('30');
  }
  await page.click('button:has-text("儲存變更")');
  await page.waitForTimeout(1500);
  await expect(page.locator('body')).not.toContainText('500');
});

test('T6.4 - 勾選「客訴」checkbox', async ({ authedPage: page }) => {
  await page.goto('/admin/operations-tracking');
  await page.locator('table tbody tr').first().click();
  await page.waitForSelector('input[type="checkbox"]', { timeout: 5000 });
  const checkboxes = page.locator('input[type="checkbox"]');
  if (await checkboxes.count() > 0) {
    await checkboxes.first().click();
  }
  await page.click('button:has-text("儲存變更")');
  await page.waitForTimeout(1000);
  await expect(page.locator('body')).not.toContainText('500');
});

test('T6.5 - CSV 匯出連結存在', async ({ authedPage: page }) => {
  await page.goto('/admin/operations-tracking');
  const csvLink = page.locator('a:has-text("CSV")');
  await expect(csvLink).toBeVisible({ timeout: 5000 });
  const href = await csvLink.getAttribute('href');
  expect(href).toContain('csv');
});
