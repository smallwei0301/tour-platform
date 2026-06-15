import { test, expect } from '@playwright/test';

/**
 * 首頁「編輯精選大卡」照片輪播 smoke。
 * 需求：編輯精選的照片改以「輪播該行程頁內照片（相片集）」呈現。
 * dev 無 Supabase 時走 fixtures：編輯精選＝柴山探洞，其行程相片集有多張 →
 * 大卡應渲染輪播容器、多張 slide 與圓點指示，且第一張預設 active。
 */

test.describe.configure({ timeout: 90_000 });

test('編輯精選大卡以輪播呈現行程頁內照片', async ({ page }) => {
  await page.goto('/');

  const featured = page.locator('section.lp-featured');
  await expect(featured).toBeVisible();

  // 卡片連結仍指向行程詳情頁（輪播不破壞整卡點擊）
  await expect(featured.locator('a.lp-feat-card')).toHaveAttribute('href', /\/activities\//);

  // 輪播容器存在，且含多張行程照片 slide
  const carousel = featured.locator('.lp-feat-carousel');
  await expect(carousel).toBeVisible();
  const slides = carousel.locator('img');
  expect(await slides.count()).toBeGreaterThan(1);

  // 第一張預設 active；多張時顯示圓點指示器
  await expect(carousel.locator('img.is-active')).toHaveCount(1);
  await expect(featured.locator('.lp-feat-dots i')).not.toHaveCount(0);

  // 編輯精選書籤仍疊在照片上
  await expect(featured.locator('img.lp-feat-badge')).toBeVisible();
});
