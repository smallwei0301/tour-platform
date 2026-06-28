import { test, expect, setTravelerSession } from './helpers';
import type { Route, Page } from '@playwright/test';

/**
 * #multilingual — /me/profile 個人資料頁的中英 i18n smoke（真實瀏覽器、backend 以 page.route mock）。
 * 語言由 NEXT_LOCALE cookie 驅動（useClientLocale）。NotificationBindingButton 透過 locale prop 跟隨。
 */

const PROFILE = {
  email: 'traveler-e2e@example.com',
  displayName: '王小明',
  phone: '0912345678',
  region: '',
  marketingEmailOptIn: true,
};

async function mockProfile(page: Page) {
  await page.route('**/api/me/profile', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: PROFILE }) });
  });
  await page.route('**/api/me/csrf', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  for (const ch of ['line', 'telegram']) {
    await page.route(`**/api/me/${ch}-binding`, async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { bound: false } }) });
    });
  }
}

async function setLocale(page: Page, locale: string) {
  await page.context().addCookies([
    { name: 'NEXT_LOCALE', value: locale, url: process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3333' },
  ]);
}

test.describe('@multilingual /me/profile i18n', () => {
  test('zh-Hant 顯示繁中介面', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'zh-Hant');
    await mockProfile(page);
    await page.goto('/me/profile');
    await expect(page.getByRole('heading', { name: '個人資料' })).toBeVisible();
    await expect(page.getByText('暱稱（顯示名稱）')).toBeVisible();
    await expect(page.getByTestId('profile-save-btn')).toHaveText('儲存');
    await expect(page.getByText('LINE 通知')).toBeVisible();
    await expect(page.getByRole('link', { name: '探索行程' })).toBeVisible();
    await page.screenshot({ path: 'test-results/profile-zh.png', fullPage: true });
  });

  test('en 顯示英文介面', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'en');
    await mockProfile(page);
    await page.goto('/me/profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByText('Nickname (display name)')).toBeVisible();
    await expect(page.getByTestId('profile-save-btn')).toHaveText('Save');
    await expect(page.getByText('LINE notifications')).toBeVisible();
    // 共用 chrome 在無前綴個人頁也跟著 cookie 切英文。
    await expect(page.getByRole('link', { name: 'Explore Routes' })).toBeVisible();
    // NotificationBindingButton 內部狀態文字也跟隨 locale。
    await expect(page.getByTestId('binding-line-status')).toHaveText('Not bound');
    await page.screenshot({ path: 'test-results/profile-en.png', fullPage: true });
  });
});
