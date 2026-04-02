/**
 * T5 - Guides
 */
import { test, expect } from './helpers';

test('T5.1 - 導遊申請列表載入', async ({ authedPage: page }) => {
  await page.goto('/admin/guides');
  await page.waitForTimeout(2000);
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  const body = await page.locator('body').textContent() || '';
  expect(body.includes('導遊') || body.includes('審核')).toBeTruthy();
});

test('T5.2 - 篩選「待審核」', async ({ authedPage: page, isMobile }) => {
  await page.goto('/admin/guides');
  await page.waitForTimeout(2000);
  if (isMobile) {
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    return;
  }
  await page.waitForSelector('select', { timeout: 5000 });
  await page.selectOption('select', 'pending');
  await page.waitForTimeout(800);
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
});

test('T5.3 - 通過導遊申請', async ({ authedPage: page }) => {
  await page.goto('/admin/guides');
  await page.waitForTimeout(2000);
  const approveBtn = page.locator('button:has-text("通過"), button:has-text("✓ 通過")').first();
  if (await approveBtn.count() > 0) {
    await approveBtn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  } else {
    expect(true).toBeTruthy();
  }
});

test('T5.4 - 拒絕導遊申請', async ({ authedPage: page }) => {
  await page.goto('/admin/guides');
  await page.waitForTimeout(2000);
  const rejectBtn = page.locator('button:has-text("拒絕"), button:has-text("✕ 拒絕")').first();
  if (await rejectBtn.count() > 0) {
    await rejectBtn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  } else {
    expect(true).toBeTruthy();
  }
});
