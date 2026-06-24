import { test, expect } from '@playwright/test';

/**
 * #multilingual 全面搬遷 — /guides/[slug] 導遊個人頁 i18n smoke。
 *
 * 個人頁已搬進 [locale]（UI chrome 英文化，導遊 bio／姓名等資料維持原文）；
 * /guides/[slug]/shop 訂房流程仍在 root（不受影響）。
 */

async function setLocaleCookie(page: import('@playwright/test').Page, value: string) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value, domain: '127.0.0.1', path: '/' }]);
}

async function firstGuideHref(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/guides');
  const link = page.locator('a.tp-link[href^="/guides/"]').first();
  await expect(link).toBeVisible();
  return (await link.getAttribute('href'))!;
}

test('英文導遊個人頁 chrome 英文化', async ({ page }) => {
  await setLocaleCookie(page, 'en');
  const href = await firstGuideHref(page);
  const resp = await page.goto(`/en${href}`);
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.getByRole('heading', { name: 'About me' })).toBeVisible();
  await expect(page.getByText('Verified', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '關於我' })).toHaveCount(0);
});

test('預設中文導遊個人頁中文', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  const href = await firstGuideHref(page);
  const resp = await page.goto(href);
  expect(resp?.status()).toBeLessThan(400);
  expect(new URL(page.url()).pathname).toBe(href);
  await expect(page.getByRole('heading', { name: '關於我' })).toBeVisible();
});

test('/guides/[slug]/shop 訂房流程仍在 root（部分搬遷不破壞）', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  const href = await firstGuideHref(page);
  const resp = await page.goto(`${href}/shop`);
  expect(resp?.status()).toBeLessThan(400);
  expect(new URL(page.url()).pathname).toBe(`${href}/shop`);
});
