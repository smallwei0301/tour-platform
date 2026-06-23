import { test, expect } from '@playwright/test';

/**
 * #multilingual Phase 0.5 PoC — LanguageSwitcher browser smoke。
 *
 * 驗證導覽列上的最小語言切換鈕（桌面）：
 *  - 先種 NEXT_LOCALE cookie 決定初始語言，讓 middleware 的 localeDetection 結果
 *    可預期（不受 Chromium 預設 Accept-Language=en 干擾）。
 *  - 預設 zh 上中文鈕為 active；點 EN → 導去 /en、EN 變 active。
 *  - 切換會寫 NEXT_LOCALE cookie 使選擇 sticky，故點中文能停在無前綴的 /activities，
 *    不被 localeDetection 彈回 /en/activities。
 *
 * 公開頁，無需 auth；DB 走 in-memory fallback（dev 無 Supabase env）。
 */

async function setLocaleCookie(page: import('@playwright/test').Page, value: string) {
  await page.context().addCookies([
    { name: 'NEXT_LOCALE', value, domain: '127.0.0.1', path: '/' },
  ]);
}

test('首頁點 EN → 切到 /en，EN 鈕變 active', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  await page.goto('/');
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.getByTestId('lang-switch-zh-Hant').first()).toHaveAttribute('aria-current', 'true');

  await page.getByTestId('lang-switch-en').first().click();
  await page.waitForURL((url) => url.pathname === '/en');
  await expect(page.getByTestId('lang-switch-en').first()).toHaveAttribute('aria-current', 'true');
});

test('/en/activities 點中文 → 回 /activities（去前綴、保留內部路徑、不被彈回）', async ({ page }) => {
  await setLocaleCookie(page, 'en');
  await page.goto('/en/activities');
  await expect(page.getByTestId('lang-switch-en').first()).toHaveAttribute('aria-current', 'true');

  await page.getByTestId('lang-switch-zh-Hant').first().click();
  await page.waitForURL((url) => url.pathname === '/activities');
  // sticky cookie 生效：停留在無前綴 /activities，不被 localeDetection 導回 /en/activities
  await page.waitForTimeout(800);
  expect(new URL(page.url()).pathname).toBe('/activities');
  await expect(page.getByTestId('lang-switch-zh-Hant').first()).toHaveAttribute('aria-current', 'true');
});
