import { test, expect } from '@playwright/test';

/**
 * #multilingual Phase 0.5 PoC — LanguageSwitcher browser smoke。
 *
 * 驗證導覽列上的最小語言切換鈕（桌面）：
 *  - 先種 NEXT_LOCALE cookie 決定初始語言，讓 middleware 的 localeDetection 結果
 *    可預期（不受 Chromium 預設 Accept-Language=en 干擾）。
 *  - 點 EN → 導去 /en、EN 變 active，且**導覽列文字實際變英文**（nav 連結、登入鈕）。
 *  - 切換會寫 NEXT_LOCALE cookie 使選擇 sticky，故點中文能停在無前綴的 /activities，
 *    不被 localeDetection 彈回 /en/activities，且導覽列文字變回中文。
 *
 * 公開頁，無需 auth；DB 走 in-memory fallback（dev 無 Supabase env）。
 */

async function setLocaleCookie(page: import('@playwright/test').Page, value: string) {
  await page.context().addCookies([
    { name: 'NEXT_LOCALE', value, domain: '127.0.0.1', path: '/' },
  ]);
}

test('首頁點 EN → /en，導覽列文字實際切換成英文', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  await page.goto('/');
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);

  // 初始：中文 active + 導覽列為中文
  await expect(page.getByTestId('lang-switch-zh-Hant').first()).toHaveAttribute('aria-current', 'true');
  const nav = page.getByRole('navigation', { name: '主要導覽' });
  await expect(nav.getByRole('link', { name: '探索行程' })).toBeVisible();
  await expect(nav.getByRole('link', { name: '登入 / 註冊' })).toBeVisible();

  // 點 EN
  await page.getByTestId('lang-switch-en').first().click();
  await page.waitForURL((url) => url.pathname === '/en');
  await expect(page.getByTestId('lang-switch-en').first()).toHaveAttribute('aria-current', 'true');

  // 導覽列文字實際變英文（且舊中文字已消失）— 這就是「切換有變化」的證據
  await expect(nav.getByRole('link', { name: 'Explore Routes' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Log in / Sign up' })).toBeVisible();
  await expect(nav.getByRole('link', { name: '探索行程' })).toHaveCount(0);
});

test('/en 點中文 → 回 /（sticky 不被彈回），導覽列文字變回中文', async ({ page }) => {
  await setLocaleCookie(page, 'en');
  await page.goto('/en');
  const nav = page.getByRole('navigation', { name: '主要導覽' });
  await expect(nav.getByRole('link', { name: 'Explore Routes' })).toBeVisible();

  await page.getByTestId('lang-switch-zh-Hant').first().click();
  await page.waitForURL((url) => url.pathname === '/');
  await page.waitForTimeout(800); // 確認 sticky cookie 生效、未被 localeDetection 導回 /en
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(nav.getByRole('link', { name: '探索行程' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Explore Routes' })).toHaveCount(0);
});

test('/en/activities 點中文 → /activities，保留內部路徑、不被彈回', async ({ page }) => {
  await setLocaleCookie(page, 'en');
  await page.goto('/en/activities');
  await expect(page.getByTestId('lang-switch-en').first()).toHaveAttribute('aria-current', 'true');

  await page.getByTestId('lang-switch-zh-Hant').first().click();
  await page.waitForURL((url) => url.pathname === '/activities');
  await page.waitForTimeout(800);
  expect(new URL(page.url()).pathname).toBe('/activities');
  await expect(page.getByTestId('lang-switch-zh-Hant').first()).toHaveAttribute('aria-current', 'true');
});
