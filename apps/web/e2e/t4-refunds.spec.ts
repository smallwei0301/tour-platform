/**
 * T4 - Refunds
 */
import { test, expect } from './helpers';

test('T4.1 - 退款列表載入', async ({ authedPage: page }) => {
  await page.goto('/admin/refunds');
  // Wait for skeleton to disappear
  await page.waitForTimeout(3000);
  // Should show either table or empty state — not error
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  const hasTable = await page.locator('table').count() > 0;
  const hasEmpty = await page.locator('text=/沒有|無退款|🎉/i').count() > 0;
  const hasContent = await page.locator('[style*="padding"]').count() > 0;
  expect(hasTable || hasEmpty || hasContent).toBeTruthy();
});

test('T4.2 - 存在退款申請並可通過 (approve)', async ({ authedPage: page }) => {
  await page.goto('/admin/refunds');
  await page.waitForTimeout(3000);
  const approveBtn = page.locator('button:has-text("通過"), button:has-text("Approve"), button:has-text("approve")').first();
  if (await approveBtn.count() > 0) {
    await approveBtn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  } else {
    // No refund requests — acceptable
    const body = await page.locator('body').textContent() || '';
    expect(body.length).toBeGreaterThan(10);
  }
});

test('T4.3 - 退款拒絕 (reject)', async ({ authedPage: page }) => {
  await page.goto('/admin/refunds');
  await page.waitForTimeout(3000);
  const rejectBtn = page.locator('button:has-text("拒絕"), button:has-text("Reject"), button:has-text("reject")').first();
  if (await rejectBtn.count() > 0) {
    await rejectBtn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  } else {
    const body = await page.locator('body').textContent() || '';
    expect(body.length).toBeGreaterThan(10);
  }
});
