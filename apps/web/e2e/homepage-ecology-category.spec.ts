import { test, expect } from '@playwright/test';

// 首頁四大分類「美食 → 生態（Wildlife & Nature）」改造 + 行程四大分類 badge 標籤化。
// 行程清單為 SSR initialActivities（in-memory 種子），故 badge 直接驗種子實際渲染，
// 不靠 page.route mock（type 篩選為純 client 端、mount 不重抓 → mock 對清單無效）。

test.describe('首頁四大分類：美食 → 生態', () => {
  test('繁中首頁第四 tile 顯示「生態」並連到 /theme/ecology', async ({ page }) => {
    await page.goto('/');
    const themes = page.locator('.lp-themes');
    await expect(themes.locator('.lp-theme-title', { hasText: '生態' })).toHaveCount(1);
    await expect(themes.getByText('美食', { exact: true })).toHaveCount(0);
    await expect(themes.locator('a[href="/theme/ecology"]')).toHaveCount(1);
  });

  test('英文首頁第四 tile 顯示「Wildlife & Nature」', async ({ page }) => {
    await page.goto('/en');
    const themes = page.locator('.lp-themes');
    await expect(themes.locator('.lp-theme-title', { hasText: 'Wildlife & Nature' })).toHaveCount(1);
    await expect(themes.getByText('Food', { exact: true })).toHaveCount(0);
    await expect(themes.locator('a[href="/theme/ecology"]')).toHaveCount(1);
  });
});

test.describe('行程卡 badge 標籤化為四大分類', () => {
  test('badge 顯示四大分類中文標籤，不再是原始英文 category 值', async ({ page }) => {
    await page.goto('/activities');

    // 柴山探洞（category outdoor）→ 山徑
    const caveCard = page.locator('[data-testid="activity-card"]', { hasText: '高雄柴山探洞體驗' });
    await expect(caveCard).toBeVisible({ timeout: 10_000 });
    await expect(caveCard.getByText('山徑', { exact: true })).toBeVisible();

    // 大稻埕（category culture）→ 文化
    const cultureCard = page.locator('[data-testid="activity-card"]', { hasText: '大稻埕百年老街深度漫步' });
    await expect(cultureCard.getByText('文化', { exact: true })).toBeVisible();

    // 不應再出現原始英文 category 值
    for (const raw of ['outdoor', 'food', 'nature', 'culture']) {
      await expect(page.getByText(raw, { exact: true })).toHaveCount(0);
    }
  });
});

test.describe('生態主題頁取代美食主題頁', () => {
  test('/theme/ecology 正常渲染生態主視覺', async ({ page }) => {
    const response = await page.goto('/theme/ecology');
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1', { hasText: '跟著在地人，讀懂一片土地' })).toBeVisible();
    await expect(page.locator('.tp-breadcrumb', { hasText: '自然生態' })).toBeVisible();
  });

  test('舊 /theme/food-tour 已移除（404）', async ({ page }) => {
    const response = await page.goto('/theme/food-tour');
    expect(response?.status()).toBe(404);
  });
});
