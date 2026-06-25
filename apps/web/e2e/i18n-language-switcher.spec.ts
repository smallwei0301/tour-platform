import { test, expect } from '@playwright/test';

/**
 * #multilingual 全面搬遷 — 首頁 + /activities 內容實際英文化 browser smoke。
 *
 * 先種 NEXT_LOCALE cookie 決定初始語言，讓 middleware localeDetection 結果可預期
 * （不受 Chromium 預設 Accept-Language=en 干擾）。驗證：
 *  - 導覽列切換語言（連結、登入鈕）。
 *  - 首頁主體（hero 標題、各區塊 eyebrow、FAQ、closing）實際 zh↔en 切換。
 *  - /activities 篩選側欄、結果標題、排序、卡片按鈕實際 zh↔en 切換。
 *  - sticky cookie：點中文停在無前綴路徑、不被彈回 /en。
 *
 * 公開頁，無需 auth；DB 走 in-memory fallback（dev 無 Supabase env）。
 */

async function setLocaleCookie(page: import('@playwright/test').Page, value: string) {
  await page.context().addCookies([
    { name: 'NEXT_LOCALE', value, domain: '127.0.0.1', path: '/' },
  ]);
}

test('首頁點 EN → /en，導覽列＋主體實際切換成英文', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  await page.goto('/');
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);

  // 初始中文：hero 標題、區塊標題、FAQ
  await expect(page.getByRole('heading', { level: 1 })).toContainText('島嶼深處');
  await expect(page.getByRole('heading', { name: '主題探索' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '常見問題' })).toBeVisible();
  await expect(page.getByTestId('lang-switch-zh-Hant').first()).toHaveAttribute('aria-current', 'true');

  // 點 EN
  await page.getByTestId('lang-switch-en').first().click();
  await page.waitForURL((url) => url.pathname === '/en');
  await expect(page.getByTestId('lang-switch-en').first()).toHaveAttribute('aria-current', 'true');

  // 導覽列英文
  await expect(page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: 'Explore Routes' })).toBeVisible();
  // 主體英文：hero 標題、區塊 eyebrow、FAQ、closing — 且舊中文已消失
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Deep in the island');
  await expect(page.getByRole('heading', { name: 'Explore by Theme' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Explore Destinations' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'FAQ' })).toBeVisible();
  await expect(page.getByText('Your Midao story starts here')).toBeVisible();
  await expect(page.getByText('島嶼深處')).toHaveCount(0);
  await expect(page.getByText('主題探索')).toHaveCount(0);
});

test('/en/activities 主體＋篩選實際英文，點中文 → /activities 變回中文且不被彈回', async ({ page }) => {
  await setLocaleCookie(page, 'en');
  await page.goto('/en/activities');

  // 英文篩選側欄與排序
  await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible();
  await expect(page.getByText('Keyword search')).toBeVisible();
  await expect(page.getByRole('option', { name: 'Recommended' })).toBeAttached();
  await expect(page.getByText('篩選條件')).toHaveCount(0);

  // 點中文
  await page.getByTestId('lang-switch-zh-Hant').first().click();
  await page.waitForURL((url) => url.pathname === '/activities');
  await page.waitForTimeout(800); // sticky cookie：不被 localeDetection 彈回 /en/activities
  expect(new URL(page.url()).pathname).toBe('/activities');
  await expect(page.getByRole('heading', { name: '篩選條件' })).toBeVisible();
  await expect(page.getByText('Filters')).toHaveCount(0);
});
