import { test, expect, setTravelerSession } from './helpers';
import type { Route } from '@playwright/test';

// #1475 — 簡化版我的訂單：所有預約 / 需付款 / 歷史預約 三分頁過濾。

const SLUG = 'wu-luo-qing';

const ORDERS = [
  { id: 'ord-pending', status: 'pending_payment', totalTwd: 610, title: '力量', peopleCount: 1, createdAt: '2026-06-17T13:40:00.000Z', scheduleStartAt: '2026-06-18T11:10:00.000Z' },
  { id: 'ord-paid', status: 'paid', totalTwd: 610, title: '力量', peopleCount: 2, createdAt: '2026-06-16T10:00:00.000Z', scheduleStartAt: '2026-06-20T03:00:00.000Z' },
  { id: 'ord-done', status: 'completed', totalTwd: 610, title: '力量', peopleCount: 1, createdAt: '2026-05-01T10:00:00.000Z', scheduleStartAt: '2026-05-10T03:00:00.000Z' },
];

test.beforeEach(async ({ page }) => {
  await setTravelerSession(page);
  await page.route('**/api/v2/orders**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: ORDERS }) })
  );
});

test('三個分頁過濾：所有 / 需付款 / 歷史', async ({ page }) => {
  await page.goto(`/guides/${SLUG}/shop/orders`);

  // 所有預約：3 張
  await expect(page.getByTestId('order-card')).toHaveCount(3);

  // 需付款：只剩 pending_payment 1 張
  await page.getByTestId('orders-tab-pending').click();
  await expect(page.getByTestId('order-card')).toHaveCount(1);
  await expect(page.getByTestId('order-card')).toContainText('需付款');

  // 歷史：只剩 completed 1 張
  await page.getByTestId('orders-tab-history').click();
  await expect(page.getByTestId('order-card')).toHaveCount(1);
  await expect(page.getByTestId('order-card')).toContainText('已完成');
});
