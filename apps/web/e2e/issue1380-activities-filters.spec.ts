import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Issue #1380 — 活動列表日期可訂 + 價格區間篩選（UI → URL → API query 同步）。
 * mock `/api/activities`（同 issue1073 pattern），記錄每次請求的 query params。
 */

const FIXTURE = [
  { id: 'a1', slug: 'act-low', title: '低價活動', region: '台北', category: 'food', priceTwd: 1200, regionSlug: 'taipei' },
  { id: 'a2', slug: 'act-mid', title: '中價活動', region: '高雄', category: 'outdoor', priceTwd: 2000, regionSlug: 'kaohsiung' },
];

test.describe('issue1380 activities filters', () => {
  let requestedUrls: string[];

  test.beforeEach(async ({ page }) => {
    requestedUrls = [];
    await page.route('**/api/activities**', async (route: Route) => {
      requestedUrls.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: FIXTURE }),
      });
    });
    await page.route('**/api/me/wishlist/ids', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    });
  });

  test('選日期 → URL 帶 date、API 請求帶 date', async ({ page }) => {
    await page.goto('/activities');
    await page.waitForLoadState('networkidle');

    // 冷編譯下 hydration 可能晚於首次 fill（SSR HTML 已在、handler 未掛上）—
    // poll 內重試 fill 直到 React 接手把狀態寫進 URL
    const dateInput = page.locator('[data-testid="activities-date-filter"]');
    await expect
      .poll(async () => {
        await dateInput.fill('2026-04-10');
        return page.url();
      }, { timeout: 10_000 })
      .toMatch(/date=2026-04-10/);

    await expect.poll(() => requestedUrls.some((u) => u.includes('date=2026-04-10'))).toBe(true);
  });

  test('價格區間 → debounce 後 URL 帶 priceMin/priceMax、API 請求帶參數', async ({ page }) => {
    await page.goto('/activities');
    await page.locator('[data-testid="activities-price-min"]').fill('1500');
    await page.locator('[data-testid="activities-price-max"]').fill('2500');

    await expect(page).toHaveURL(/priceMin=1500/, { timeout: 5000 });
    await expect(page).toHaveURL(/priceMax=2500/);
    await expect.poll(() =>
      requestedUrls.some((u) => u.includes('priceMin=1500') && u.includes('priceMax=2500'))
    ).toBe(true);
  });

  test('帶參數直開（分享連結/重新整理）→ 控制項回填且首載 fetch 帶參數', async ({ page }) => {
    await page.goto('/activities?date=2026-04-10&priceMin=1000&priceMax=3000');

    await expect(page.locator('[data-testid="activities-date-filter"]')).toHaveValue('2026-04-10');
    await expect(page.locator('[data-testid="activities-price-min"]')).toHaveValue('1000');
    await expect(page.locator('[data-testid="activities-price-max"]')).toHaveValue('3000');
    await expect.poll(() =>
      requestedUrls.some((u) => u.includes('date=2026-04-10') && u.includes('priceMin=1000'))
    ).toBe(true);
  });

  test('清除全部 → 控制項與 URL 復原', async ({ page }) => {
    await page.goto('/activities?date=2026-04-10&priceMin=1000');
    await page.getByRole('button', { name: '清除全部' }).click();

    await expect(page).toHaveURL(/\/activities$/);
    await expect(page.locator('[data-testid="activities-date-filter"]')).toHaveValue('');
    await expect(page.locator('[data-testid="activities-price-min"]')).toHaveValue('');
  });
});
