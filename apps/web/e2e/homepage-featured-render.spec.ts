import { test, expect } from '@playwright/test';

/**
 * 首頁精選渲染 smoke：確認 LpFeatured / LpTours 改吃 view-model 後仍正常渲染。
 * dev 無 Supabase 時 listPublishedActivitiesDb 回 fixtures 形狀 →
 * 走 resolveHomepageFeaturedView + 元件 view-model 路徑（與正式同程式碼路徑）。
 */

test.describe.configure({ timeout: 90_000 });

test('首頁載入：編輯精選大卡 + 更多精選行程皆渲染且連結指向行程頁', async ({ page }) => {
  await page.goto('/');

  // 編輯精選大卡
  const featured = page.locator('section.lp-featured');
  await expect(featured).toBeVisible();
  await expect(featured.locator('.lp-feat-title')).not.toBeEmpty();
  await expect(featured.locator('.lp-feat-price')).toContainText('NT$');
  // 大卡連結指向行程詳情頁
  await expect(featured.locator('a.lp-feat-card')).toHaveAttribute('href', /\/activities\//);

  // 更多精選行程：至少 1 張卡
  const tours = page.locator('section.lp-tours .lp-tour-card');
  await expect(tours.first()).toBeVisible();
  await expect(tours.first().locator('.lp-tour-title')).not.toBeEmpty();
  await expect(tours.first()).toHaveAttribute('href', /\/activities\//);
});
