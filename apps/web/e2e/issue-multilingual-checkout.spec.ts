import { test, expect, setTravelerSession } from './helpers';
import type { Route, Page } from '@playwright/test';

/**
 * #multilingual — /checkout（legacy fallback 結帳頁）的中英 i18n smoke（真實瀏覽器、backend mock）。
 * 語言由 NEXT_LOCALE cookie 驅動（useClientLocale）。
 */

const SLUG = 'kaohsiung-chaishan-cave-experience';

const ACTIVITY = {
  id: 'act-e2e',
  title: '蘭嶼夜觀生態導覽',
  priceTwd: 1600,
  schedules: [
    { id: 'sch-1', startAt: '2026-12-31T02:00:00Z', endAt: '2026-12-31T05:00:00Z', capacity: 10, bookedCount: 2, status: 'open' },
  ],
  plans: [],
};

async function mockCheckout(page: Page) {
  await page.route(`**/api/activities/${SLUG}`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: ACTIVITY }) });
  });
  await page.route('**/api/v2/promo-codes/public', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });
  await page.route('**/api/me/profile', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
  });
  await page.route('**/api/me/csrf', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

async function setLocale(page: Page, locale: string) {
  await page.context().addCookies([
    { name: 'NEXT_LOCALE', value: locale, url: process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3333' },
  ]);
}

test.describe('@multilingual /checkout i18n', () => {
  test('zh-Hant', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'zh-Hant');
    await mockCheckout(page);
    await page.goto(`/checkout?slug=${SLUG}`);
    await expect(page.getByText('聯絡人資料')).toBeVisible();
    await expect(page.getByRole('button', { name: '建立訂單' })).toBeVisible();
    await page.screenshot({ path: 'test-results/checkout-zh.png', fullPage: true });
  });

  test('en', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'en');
    await mockCheckout(page);
    await page.goto(`/checkout?slug=${SLUG}`);
    await expect(page.getByText('Contact details')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create order' })).toBeVisible();
    await expect(page.getByText('Legacy checkout entry (Legacy fallback)')).toBeVisible();
    await page.screenshot({ path: 'test-results/checkout-en.png', fullPage: true });
  });
});
