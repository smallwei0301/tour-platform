/**
 * T5 - 導遊審核
 */
import { test, expect } from './helpers';

test('T5.1 - 導遊申請列表載入', async ({ authedPage: page }) => {
  await page.goto('/admin/guides');
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  const hasCard = await page.locator('[style*="border-radius"]').count() > 1;
  const hasEmpty = await page.locator('text=/沒有|無/i').count() > 0;
  expect(hasCard || hasEmpty).toBeTruthy();
});

test('T5.2 - 篩選「待審核」', async ({ authedPage: page }) => {
  await page.goto('/admin/guides');
  await page.selectOption('select', 'pending');
  await page.waitForTimeout(800);
  await expect(page.locator('body')).not.toContainText('500');
});

test('T5.3 - 通過導遊申請', async ({ authedPage: page }) => {
  await page.goto('/admin/guides');
  const approveBtn = page.locator('button:has-text("通過")').first();
  if (await approveBtn.count() > 0) {
    await approveBtn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText('500');
  }
});

test('T5.4 - 拒絕導遊申請', async ({ authedPage: page }) => {
  await page.goto('/admin/guides');
  const rejectBtn = page.locator('button:has-text("拒絕")').first();
  if (await rejectBtn.count() > 0) {
    await rejectBtn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText('500');
  }
});
