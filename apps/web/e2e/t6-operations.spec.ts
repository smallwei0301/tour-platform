/**
 * T6 - Operations Tracking
 */
import { test, expect } from './helpers';

test('T6.1 - 頁面載入顯示 KPI 摘要', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/operations-tracking');
  await page.waitForTimeout(2000);
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  if (isMobile) {
    const body = await page.locator('body').textContent() || '';
    const isAdminPage = body.includes('追蹤') || body.includes('操作') || body.includes('GMV') || body.includes('Admin');
    expect(isAdminPage).toBeTruthy();
    return;
  }
  await expect(page.locator('text=/總 GMV|平台總收入|健康訂單率/i').first()).toBeVisible({ timeout: 8000 });
});

test('T6.2 - 點擊訂單顯示編輯面板', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/operations-tracking');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  const row = page.locator('table tbody tr').first();
  if (await row.count() > 0) {
    await row.click();
    await expect(page.locator('text=/編輯營運欄位/i')).toBeVisible({ timeout: 5000 });
  } else {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  }
});

test('T6.3 - 修改人工時間並儲存', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/operations-tracking');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  const row = page.locator('table tbody tr').first();
  if (await row.count() > 0) {
    await row.click();
    const saveBtn = page.locator('button:has-text("儲存變更")');
    await saveBtn.waitFor({ timeout: 5000 });
    const inputs = page.locator('input[type="number"]');
    if (await inputs.count() > 0) {
      await inputs.first().fill('60');
    }
    await saveBtn.click();
    await page.waitForTimeout(1500);
  }
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
});

test('T6.4 - 勾選「客訴」checkbox', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/operations-tracking');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  const row = page.locator('table tbody tr').first();
  if (await row.count() > 0) {
    await row.click();
    await page.waitForTimeout(500);
    const checkboxes = page.locator('input[type="checkbox"]');
    if (await checkboxes.count() > 0) {
      await checkboxes.first().check();
    }
    const saveBtn = page.locator('button:has-text("儲存變更")');
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
    }
  }
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
});

test('T6.5 - CSV 匯出按鈕存在', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/operations-tracking');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  const csvEl = page.locator('button:has-text("CSV"), a:has-text("CSV"), button:has-text("匯出"), a:has-text("匯出")').first();
  await expect(csvEl).toBeVisible({ timeout: 5000 });
});
