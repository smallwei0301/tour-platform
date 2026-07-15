import { test, expect } from '@playwright/test';

// Issue #1569（健檢 v2 SEO-2）— <html lang> 隨 locale 正確輸出。
// 修復前：root layout 硬編 lang="zh-Hant"，/en 頁 lang 錯誤。
// 修復後：root layout 用 getLocale() → HTML_LANG[locale]。

test.describe('Issue #1569 — <html lang> 隨 locale', () => {
  test('T1569.0 — 初始 SSR HTML 在 hydration 前就依 locale 輸出正確 lang', async ({ page }) => {
    const zhResponse = await page.goto('/');
    const enResponse = await page.goto('/en');
    const enActivitiesResponse = await page.goto('/en/activities');

    expect(await zhResponse?.text()).toContain('<html lang="zh-Hant"');
    expect(await enResponse?.text()).toContain('<html lang="en"');
    expect(await enActivitiesResponse?.text()).toContain('<html lang="en"');
  });

  test('T1569.1 — 預設繁中頁輸出 lang="zh-Hant"', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  });

  test('T1569.2 — /en 頁輸出 lang="en"', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('T1569.3 — /en/activities 也輸出 lang="en"', async ({ page }) => {
    await page.goto('/en/activities');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
