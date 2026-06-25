import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

/**
 * #multilingual — /me/orders 列表與詳情頁的中英 i18n smoke（真實瀏覽器、backend 以 page.route mock）。
 *
 * 列表頁 `/api/me/orders` 回傳陣列；詳情頁 `/api/me/orders/[id]` 回傳 { data }。
 * 語言由 NEXT_LOCALE cookie 驅動（MemberTabs / 訂單頁走 useClientLocale）。
 */

const ORDER_ID = 'ord-e2e-1';

const LIST = [
  {
    id: ORDER_ID,
    status: 'paid',
    totalTwd: 3200,
    title: '蘭嶼夜觀生態導覽',
    peopleCount: 2,
    contactEmail: 'traveler-e2e@example.com',
    createdAt: '2026-06-01T02:00:00Z',
    paidAt: '2026-06-01T03:00:00Z',
    scheduleId: 'sch-1',
  },
];

const DETAIL = {
  id: ORDER_ID,
  status: 'paid',
  totalTwd: 3200,
  title: '蘭嶼夜觀生態導覽',
  peopleCount: 2,
  contactName: '王小明',
  contactPhone: '0912345678',
  contactEmail: 'traveler-e2e@example.com',
  createdAt: '2026-06-01T02:00:00Z',
  paidAt: '2026-06-01T03:00:00Z',
  scheduleId: 'sch-1',
  scheduleStartAt: '2026-12-31T02:00:00Z',
};

async function mockOrders(page: import('@playwright/test').Page) {
  await page.route('**/api/me/orders', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: LIST }) });
  });
  await page.route(`**/api/me/orders/${ORDER_ID}`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: DETAIL }) });
  });
  await page.route(`**/api/me/orders/${ORDER_ID}/messages`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { messages: [], readonly: false } }) });
  });
}

async function setLocale(page: import('@playwright/test').Page, locale: string) {
  await page.context().addCookies([
    { name: 'NEXT_LOCALE', value: locale, url: process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3333' },
  ]);
}

test.describe('@multilingual /me/orders i18n', () => {
  test('列表頁 zh-Hant 顯示繁中介面', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'zh-Hant');
    await mockOrders(page);
    await page.goto('/me/orders');
    await expect(page.getByTestId('my-orders-title')).toHaveText('我的訂單');
    await expect(page.getByTestId('member-tab-orders')).toHaveText('我的訂單');
    await expect(page.getByTestId('member-tab-wishlist')).toHaveText('我的最愛');
    await expect(page.getByText('2 人')).toBeVisible();
    // 預設 zh-Hant：共用 chrome 維持繁中。
    await expect(page.getByRole('link', { name: '探索行程' })).toBeVisible();
    await page.screenshot({ path: 'test-results/orders-list-zh.png', fullPage: true });
  });

  test('列表頁 en 顯示英文介面', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'en');
    await mockOrders(page);
    await page.goto('/me/orders');
    await expect(page.getByTestId('my-orders-title')).toHaveText('My Orders');
    await expect(page.getByTestId('member-tab-orders')).toHaveText('My Orders');
    await expect(page.getByTestId('member-tab-wishlist')).toHaveText('Favorites');
    await expect(page.getByText('2 people')).toBeVisible();
    // 共用 chrome（Navbar）在無前綴個人頁也應跟著 cookie 切英文（#multilingual）。
    await expect(page.getByRole('link', { name: 'Explore Routes' })).toBeVisible();
    await page.screenshot({ path: 'test-results/orders-list-en.png', fullPage: true });
  });

  test('詳情頁 zh-Hant 顯示繁中標籤', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'zh-Hant');
    await mockOrders(page);
    await page.goto(`/me/orders/${ORDER_ID}`);
    await expect(page.getByText('訂單資訊')).toBeVisible();
    await expect(page.getByText('出發時間')).toBeVisible();
    await expect(page.getByText('聯絡資訊')).toBeVisible();
    await page.screenshot({ path: 'test-results/orders-detail-zh.png', fullPage: true });
  });

  test('詳情頁 en 顯示英文標籤', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'en');
    await mockOrders(page);
    await page.goto(`/me/orders/${ORDER_ID}`);
    await expect(page.getByText('Order information')).toBeVisible();
    await expect(page.getByText('Contact information')).toBeVisible();
    await page.screenshot({ path: 'test-results/orders-detail-en.png', fullPage: true });
  });
});
