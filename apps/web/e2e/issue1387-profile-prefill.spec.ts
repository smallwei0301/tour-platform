import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Issue #1387 — /me/profile 編輯儲存 + checkout 聯絡資訊預填。
 * 後端以 page.route mock（profile GET/PATCH）；checkout 活動資料用 in-memory fixture。
 */

const PROFILE = { displayName: '林小美', phone: '0987111222', marketingEmailOptIn: true, email: 'traveler-e2e@example.com' };

test.describe('issue1387 profile', () => {
  test('/me/profile：載入回填 → 編輯 → 儲存（PATCH payload 正確）', async ({ page }) => {
    await setTravelerSession(page);

    let patched: Record<string, unknown> | null = null;
    await page.route('**/api/me/profile**', async (route: Route) => {
      if (route.request().method() === 'PATCH') {
        patched = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ...PROFILE, ...patched } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: PROFILE }) });
    });

    await page.goto('/me/profile');

    const nameInput = page.locator('[data-testid="profile-display-name"]');
    await expect(nameInput).toHaveValue('林小美', { timeout: 10_000 });
    await expect(page.locator('[data-testid="profile-phone"]')).toHaveValue('0987111222');

    await nameInput.fill('林大美');
    await page.locator('[data-testid="profile-marketing"]').uncheck();
    await page.locator('[data-testid="profile-save-btn"]').click();

    await expect(page.locator('[data-testid="profile-saved"]')).toBeVisible();
    expect(patched).not.toBeNull();
    expect(patched!.displayName).toBe('林大美');
    expect(patched!.marketingEmailOptIn).toBe(false);
  });

  test('未登入訪問 /me/profile 導向登入', async ({ page }) => {
    await page.goto('/me/profile');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');
  });

  test('checkout 聯絡欄位預填 profile 值且可覆寫', async ({ page }) => {
    await setTravelerSession(page);
    await page.route('**/api/me/profile**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: PROFILE }) });
    });

    await page.goto('/checkout?slug=kaohsiung-chaishan-cave-experience');

    const nameInput = page.getByPlaceholder('王小明');
    await expect(nameInput).toHaveValue('林小美', { timeout: 15_000 });

    await nameInput.fill('改寫的名字');
    await expect(nameInput).toHaveValue('改寫的名字');
  });
});
