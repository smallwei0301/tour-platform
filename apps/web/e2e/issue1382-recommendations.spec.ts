import { test, expect } from './helpers';
import type { Route } from '@playwright/test';

/**
 * Issue #1382 — 活動頁推薦（同地區/同類型）＋最近瀏覽。
 * 詳情頁主內容走 in-memory fixture SSR；推薦資料來源 `/api/activities`
 * 為 client fetch，以 page.route mock 控制。
 */

const DETAIL = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience'; // region 高雄市 / category outdoor
const SECOND_DETAIL = '/activities/taipei/dadadaocheng-walk';

const LIST = {
  ok: true,
  data: [
    { id: '1', slug: 'kaohsiung-chaishan-cave-experience', title: '高雄柴山探洞體驗', region: '高雄市', regionSlug: 'kaohsiung', category: 'outdoor', priceTwd: 2000, coverImageUrl: null },
    { id: '2', slug: 'kaohsiung-harbor-walk', title: '高雄港散步', region: '高雄市', regionSlug: 'kaohsiung', category: 'culture', priceTwd: 900, coverImageUrl: null },
    { id: '3', slug: 'hualien-river-trekking', title: '花蓮溯溪', region: '花蓮', regionSlug: 'hualien', category: 'outdoor', priceTwd: 3200, coverImageUrl: null },
  ],
};

test.describe('issue1382 recommendations', () => {
  test('同地區/同類型推薦渲染且排除當前活動', async ({ page }) => {
    await page.route('**/api/activities?**', async (r: Route) => r.fallback());
    await page.route('**/api/activities', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST) });
    });

    await page.goto(DETAIL);

    const sameRegion = page.locator('[data-testid="recs-same-region"]');
    await expect(sameRegion).toBeVisible({ timeout: 15_000 });
    await expect(sameRegion).toContainText('高雄港散步');
    await expect(sameRegion).not.toContainText('柴山探洞');

    const sameCategory = page.locator('[data-testid="recs-same-category"]');
    await expect(sameCategory).toBeVisible();
    await expect(sameCategory).toContainText('花蓮溯溪');
    await expect(sameCategory).not.toContainText('柴山探洞');
  });

  test('該地區/類型無其他活動時優雅隱藏區塊', async ({ page }) => {
    await page.route('**/api/activities', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [LIST.data[0]] }), // 只有自己
      });
    });

    await page.goto(DETAIL);
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="recs-same-region"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="recs-same-category"]')).toHaveCount(0);
  });

  test('最近瀏覽：看過 A 後到 B 頁，最近瀏覽出現 A（跨頁 localStorage）', async ({ page }) => {
    await page.route('**/api/activities', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
    });

    await page.goto(DETAIL); // 記錄柴山
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

    await page.goto(SECOND_DETAIL); // 到大稻埕
    const recent = page.locator('[data-testid="recs-recently-viewed"]');
    await expect(recent).toBeVisible({ timeout: 15_000 });
    await expect(recent).toContainText('柴山');
    await expect(recent).not.toContainText('大稻埕');
  });
});
