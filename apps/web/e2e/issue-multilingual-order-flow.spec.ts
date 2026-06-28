import { test, expect, setTravelerSession } from './helpers';
import type { Route, Page } from '@playwright/test';

/**
 * #multilingual — /order/success 與 /order/pay 的中英 i18n smoke（真實瀏覽器、backend mock）。
 * 兩頁皆讀 /api/me/orders/{orderId}?contactEmail=... 的 { data }；語言由 NEXT_LOCALE cookie 驅動。
 * /order/success 是 V2 booking 送出後的 live 落地頁。
 */

const ORDER_ID = 'ord-flow-e2e';

const ORDER = {
  id: ORDER_ID,
  status: 'pending_payment',
  totalTwd: 3200,
  title: '蘭嶼夜觀生態導覽',
  peopleCount: 2,
  contactName: '王小明',
  contactEmail: 'traveler-e2e@example.com',
  createdAt: '2026-06-01T02:00:00Z',
};

async function mockOrder(page: Page, status = 'pending_payment') {
  await page.route(`**/api/me/orders/${ORDER_ID}**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...ORDER, status } }) });
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

test.describe('@multilingual order flow i18n', () => {
  test('/order/success zh-Hant', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'zh-Hant');
    await mockOrder(page, 'paid');
    await page.goto(`/order/success?orderId=${ORDER_ID}`);
    await expect(page.getByRole('heading', { name: '訂單建立成功' })).toBeVisible();
    await expect(page.getByText('訂單編號')).toBeVisible();
    await page.screenshot({ path: 'test-results/order-success-zh.png', fullPage: true });
  });

  test('/order/success en', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'en');
    await mockOrder(page, 'paid');
    await page.goto(`/order/success?orderId=${ORDER_ID}`);
    await expect(page.getByRole('heading', { name: 'Order created successfully' })).toBeVisible();
    await expect(page.getByText('Order number')).toBeVisible();
    await expect(page.getByText('Paid ✓')).toBeVisible();
    await page.screenshot({ path: 'test-results/order-success-en.png', fullPage: true });
  });

  test('/order/pay zh-Hant', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'zh-Hant');
    await mockOrder(page, 'pending_payment');
    await page.goto(`/order/pay?orderId=${ORDER_ID}&email=${encodeURIComponent(ORDER.contactEmail)}`);
    await expect(page.getByRole('heading', { name: '確認付款' })).toBeVisible();
    await expect(page.getByText('訂單摘要')).toBeVisible();
    await expect(page.getByRole('button', { name: '前往 ECPay 付款' })).toBeVisible();
    await page.screenshot({ path: 'test-results/order-pay-zh.png', fullPage: true });
  });

  test('/order/pay en', async ({ page }) => {
    await setTravelerSession(page);
    await setLocale(page, 'en');
    await mockOrder(page, 'pending_payment');
    await page.goto(`/order/pay?orderId=${ORDER_ID}&email=${encodeURIComponent(ORDER.contactEmail)}`);
    await expect(page.getByRole('heading', { name: 'Confirm payment' })).toBeVisible();
    await expect(page.getByText('Order summary')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay with ECPay' })).toBeVisible();
    await page.screenshot({ path: 'test-results/order-pay-en.png', fullPage: true });
  });
});
