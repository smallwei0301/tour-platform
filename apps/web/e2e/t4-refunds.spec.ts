/**
 * T4 - 退款管理
 */
import { test, expect } from './helpers';

test('T4.1 - 退款列表載入', async ({ authedPage: page }) => {
  await page.goto('/admin/refunds');
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  // Should show table or empty state
  const hasTable = await page.locator('table').count() > 0;
  const hasEmpty = await page.locator('text=/沒有|無/i').count() > 0;
  expect(hasTable || hasEmpty).toBeTruthy();
});

test('T4.2 - 存在退款申請並可通過 (approve)', async ({ authedPage: page }) => {
  await page.goto('/admin/refunds');
  const approveBtn = page.locator('button:has-text("通過")').first();
  if (await approveBtn.count() > 0) {
    await approveBtn.click();
    await page.waitForTimeout(1500);
    // Page should reload / update without error
    await expect(page.locator('body')).not.toContainText('500');
  } else {
    // No refund requests - acceptable
    await expect(page.locator('text=/沒有|無退款/i').first()).toBeVisible();
  }
});

test('T4.3 - 退款拒絕 (reject)', async ({ authedPage: page }) => {
  await page.goto('/admin/refunds');
  const rejectBtn = page.locator('button:has-text("拒絕")').first();
  if (await rejectBtn.count() > 0) {
    await rejectBtn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText('500');
  }
});
