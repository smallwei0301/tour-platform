import { test, expect } from '@playwright/test';

/**
 * #multilingual #6 — zh-first + cookie-sticky locale 行為。
 *
 * - 新訪客（無 NEXT_LOCALE cookie）一律落在預設繁中，不因瀏覽器 Accept-Language=en
 *   自動跳到 /en（routing.localeDetection=false）。
 * - 曾選過英文（cookie=en）者，未帶前綴的站內連結會 sticky redirect 到 /en/*
 *   （middleware cookie redirect），維持語言連續性。
 */

test('新訪客（無 cookie）造訪 / 不被自動導到 /en（zh-first）', async ({ page }) => {
  // 預設 Chromium Accept-Language 偏 en；確保不再自動跳轉。
  await page.context().clearCookies();
  await page.goto('/');
  expect(new URL(page.url()).pathname).toBe('/');
  await page.goto('/activities');
  expect(new URL(page.url()).pathname).toBe('/activities');
});

test('已選英文（cookie=en）造訪未帶前綴路徑會 sticky 導到 /en/*', async ({ page }) => {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', domain: '127.0.0.1', path: '/' }]);
  await page.goto('/activities');
  await page.waitForURL((url) => url.pathname === '/en/activities');
  expect(new URL(page.url()).pathname).toBe('/en/activities');
  // 首頁亦然
  await page.goto('/');
  await page.waitForURL((url) => url.pathname === '/en');
  expect(new URL(page.url()).pathname).toBe('/en');
});

test('cookie=zh-Hant（預設）不觸發前綴 redirect', async ({ page }) => {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'zh-Hant', domain: '127.0.0.1', path: '/' }]);
  await page.goto('/activities');
  expect(new URL(page.url()).pathname).toBe('/activities');
});
