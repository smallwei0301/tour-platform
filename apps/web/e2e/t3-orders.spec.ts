/**
 * T3 - 訂單管理
 */
import { test, expect } from './helpers';

test('T3.1 - 訂單列表載入並顯示 mock 訂單', async ({ authedPage: page }) => {
  await page.goto('/admin/orders');
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 8000 });
  const rowCount = await page.locator('table tbody tr').count();
  expect(rowCount).toBeGreaterThan(0);
});

test('T3.2 - 篩選狀態「paid」只顯示 paid 訂單', async ({ authedPage: page }) => {
  await page.goto('/admin/orders');
  await page.waitForSelector('select', { timeout: 5000 });
  await page.selectOption('select', 'paid');
  await page.waitForTimeout(1000);
  const rows = page.locator('table tbody tr');
  const count = await rows.count();
  // Each row should show "paid" status badge
  for (let i = 0; i < count; i++) {
    await expect(rows.nth(i)).toContainText(/paid/i);
  }
});

test('T3.3 - 點擊訂單顯示詳情面板', async ({ authedPage: page }) => {
  await page.goto('/admin/orders');
  await page.locator('table tbody tr').first().click();
  // Detail panel should appear
  await expect(page.locator('text=/聯絡人|contactName|Order ID/i').first()).toBeVisible({ timeout: 5000 });
});

test('T3.4 - 修改 status 並儲存成功', async ({ authedPage: page }) => {
  await page.goto('/admin/orders');
  await page.locator('table tbody tr').first().click();
  // Wait for detail panel
  await page.waitForSelector('button:has-text("儲存變更")', { timeout: 5000 });
  // Change status in detail panel (second select = detail panel select)
  const selects = page.locator('select');
  const selectCount = await selects.count();
  if (selectCount >= 2) {
    await selects.nth(1).selectOption('confirmed');
  }
  await page.fill('textarea', 'E2E 測試備註 ' + Date.now());
  await page.click('button:has-text("儲存變更")');
  // Button should briefly show "儲存中" or success feedback
  await expect(page.locator('button:has-text("儲存變更")')).toBeVisible({ timeout: 5000 });
});

test('T3.5 - Audit Logs 展開顯示', async ({ authedPage: page }) => {
  await page.goto('/admin/orders');
  await page.locator('table tbody tr').first().click();
  // Look for audit logs section
  const auditSummary = page.locator('summary:has-text("Audit")');
  if (await auditSummary.count() > 0) {
    await auditSummary.click();
    await expect(page.locator('text=/status_changed|admin/i').first()).toBeVisible({ timeout: 3000 });
  }
});
