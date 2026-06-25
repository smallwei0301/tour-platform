import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

/**
 * issue #1501 — admin 訂單列表「來源」欄與來源篩選。
 *
 * 後端 mock 依 sourceChannel 查詢參數過濾，驗證：
 *   1. 列表呈現來源標籤（官網／LINE／後台 POS／外部通路）。
 *   2. 來源篩選會帶上 sourceChannel 參數重新查詢，外部通路只剩 external 訂單。
 */

const ALL = [
  { id: 'ORD-WEB', status: 'paid', sourceChannel: 'web', totalTwd: 3000, costTwd: 2550, marginTwd: 450, title: '官網訂單', peopleCount: 1, contactName: 'A', contactEmail: 'a@b.c', createdAt: '2026-06-25T00:00:00Z' },
  { id: 'ORD-EXT', status: 'paid', sourceChannel: 'external', totalTwd: 5000, costTwd: 4250, marginTwd: 750, title: '外部通路訂單', peopleCount: 2, contactName: 'B', contactEmail: 'b@b.c', createdAt: '2026-06-25T01:00:00Z' },
];

test('admin 訂單列表顯示來源欄，並可依來源篩選', async ({ authedPage: page }) => {
  const seenUrls: string[] = [];
  await page.route('**/api/admin/orders**', (r: Route) => {
    const url = new URL(r.request().url());
    seenUrls.push(url.search);
    const src = url.searchParams.get('sourceChannel') || '';
    const data = src ? ALL.filter((o) => o.sourceChannel === src) : ALL;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });

  await page.goto('/admin/orders');

  // 初始：兩筆都在，來源欄顯示標籤
  await expect(page.getByText('官網訂單').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('外部通路訂單').first()).toBeVisible();
  const sources = page.getByTestId('admin-order-source');
  await expect(sources.filter({ hasText: '官網' }).first()).toBeVisible();
  await expect(sources.filter({ hasText: '外部通路' }).first()).toBeVisible();

  // 篩選「外部通路」→ 帶 sourceChannel=external 重新查詢，只剩外部訂單
  await page.getByTestId('admin-order-source-filter').selectOption('external');
  await expect(page.getByText('外部通路訂單').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('官網訂單')).toHaveCount(0);
  expect(seenUrls.some((s) => s.includes('sourceChannel=external'))).toBeTruthy();
});
