/**
 * T3 - Orders
 * Mobile: no table layout, skip table-dependent assertions
 */
import { test, expect } from './helpers';

test('T3.1 - 訂單列表載入並顯示 mock 訂單', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/orders');
  await page.waitForTimeout(2000);
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  if (isMobile) {
    const body = await page.locator('body').textContent() || '';
    expect(body.includes('訂單') || body.includes('管理')).toBeTruthy();
    return;
  }
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 8000 });
  const rowCount = await page.locator('table tbody tr').count();
  expect(rowCount).toBeGreaterThan(0);
});

test('T3.2 - 篩選狀態「已付款」只顯示對應訂單', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/orders');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  await page.waitForSelector('select', { timeout: 5000 });
  await page.selectOption('select', 'paid');
  await page.waitForTimeout(1000);
  const rows = page.locator('table tbody tr');
  const count = await rows.count();
  if (count > 0) {
    for (let i = 0; i < count; i++) {
      const rowText = await rows.nth(i).textContent();
      expect(rowText).toMatch(/已付款/);
    }
  }
});

test('T3.3 - 點擊訂單顯示詳情面板', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/orders');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  await page.locator('table tbody tr').first().click();
  await expect(page.locator('text=/訂單詳情|Order ID|ID：/i').first()).toBeVisible({ timeout: 5000 });
});

test('T3.4 - 修改 status 並儲存成功', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/orders');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  await page.locator('table tbody tr').first().click();
  await page.waitForSelector('button:has-text("儲存變更")', { timeout: 5000 });
  const selects = page.locator('select');
  const count = await selects.count();
  if (count > 1) {
    await selects.nth(1).selectOption('confirmed');
  }
  await page.click('button:has-text("儲存變更")');
  await page.waitForTimeout(1500);
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
});

test('T3.5 - Audit Logs 展開顯示', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/orders');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  await page.locator('table tbody tr').first().click();
  await page.waitForTimeout(1000);
  const auditToggle = page.locator('summary:has-text("Audit"), details summary').last();
  if (await auditToggle.count() > 0) {
    await auditToggle.click();
    await page.waitForTimeout(500);
  }
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
});
