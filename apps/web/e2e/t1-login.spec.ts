/**
 * T1 - Admin Login
 */
import { test as base, expect } from '@playwright/test';
import { adminLogin } from './helpers';

const ADMIN_TOKEN = process.env.ADMIN_ACCESS_TOKEN || 'test-token-123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@tour-platform.com';

test('T1.1 - 正確登入後導向 /admin', async ({ page }) => {
  await adminLogin(page);
  await expect(page).toHaveURL(/\/admin$/);
});

test('T1.2 - 錯誤 token 顯示錯誤訊息', async ({ page }) => {
  await page.goto('/admin/login');
  await page.fill('input[type="password"]', 'wrong-token-xyz');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=/失敗|UNAUTHORIZED|error/i')).toBeVisible({ timeout: 5000 });
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('T1.3 - 未登入直接訪問 /admin 被重導', async ({ page }) => {
  await page.goto('/admin');
  // Should redirect to login or unauthorized
  await expect(page).toHaveURL(/\/admin\/(login|unauthorized)/);
});
