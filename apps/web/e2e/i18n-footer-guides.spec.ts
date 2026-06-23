import { test, expect } from '@playwright/test';

/**
 * #multilingual 全面搬遷 — Footer（全站共用 chrome）+ /guides 列表 i18n smoke。
 *
 * - Footer 在 NextIntlClientProvider 之外，依 pathname 前綴自行切語言（同 Navbar）。
 * - /guides 列表已搬進 [locale]；/guides/[slug] 仍在 root（中文），故 exact match。
 * - 種 NEXT_LOCALE cookie 讓 localeDetection 結果可預期。
 */

async function setLocaleCookie(page: import('@playwright/test').Page, value: string) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value, domain: '127.0.0.1', path: '/' }]);
}

test('Footer 依 locale 切換（首頁）', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  await page.goto('/');
  const footer = page.locator('footer.tp-footer');
  await expect(footer.getByRole('heading', { name: '平台資訊' })).toBeVisible();
  await expect(footer.getByText('依地區探索')).toBeVisible();

  await setLocaleCookie(page, 'en');
  await page.goto('/en');
  await expect(footer.getByRole('heading', { name: 'Platform' })).toBeVisible();
  await expect(footer.getByText('Explore by region')).toBeVisible();
  await expect(footer.getByText('平台資訊')).toHaveCount(0);
});

test('英文 /en/guides 列表 UI 英文化', async ({ page }) => {
  await setLocaleCookie(page, 'en');
  const resp = await page.goto('/en/guides');
  expect(resp?.status()).toBeLessThan(400);
  expect(page.url()).toContain('/en/guides');
  await expect(page.getByRole('heading', { name: 'Filter guides' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('local guides across Taiwan');
  await expect(page.getByRole('option', { name: 'Recommended' })).toBeAttached();
  await expect(page.getByText('導遊篩選')).toHaveCount(0);
});

test('預設中文 /guides 列表中文', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  const resp = await page.goto('/guides');
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.getByRole('heading', { name: '導遊篩選' })).toBeVisible();
});

test('/guides/[slug] 個人頁仍在 root 正常渲染（部分搬遷不破壞）', async ({ page }) => {
  // 從中文列表抓第一個導遊連結，點進去應 200（root [slug] 頁，未國際化）。
  await setLocaleCookie(page, 'zh-Hant');
  await page.goto('/guides');
  const firstProfile = page.locator('a.tp-link[href^="/guides/"]').first();
  await expect(firstProfile).toBeVisible();
  const href = await firstProfile.getAttribute('href');
  const resp = await page.goto(href!);
  expect(resp?.status()).toBeLessThan(400);
  expect(new URL(page.url()).pathname).toBe(href);
});
