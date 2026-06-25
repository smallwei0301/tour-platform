import { test, expect } from '@playwright/test';

/**
 * #multilingual 全面搬遷 — /experiences/[slug] 體驗詳情頁 i18n smoke。
 *
 * 已搬進 [locale]；UI chrome 英文化，體驗 title／description／亮點等資料維持原文。
 * 頁面以 server-side fetch 讀 /api/experiences（in-memory fallback），故用實際存在
 * 的 slug；種 NEXT_LOCALE cookie 讓 localeDetection 可預期。
 */

const SLUG = 'kaohsiung-chaishan-cave-experience';

async function setLocaleCookie(page: import('@playwright/test').Page, value: string) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value, domain: '127.0.0.1', path: '/' }]);
}

test('英文 /en/experiences/[slug] chrome 英文化', async ({ page }) => {
  await setLocaleCookie(page, 'en');
  const resp = await page.goto(`/en/experiences/${SLUG}`);
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.getByRole('heading', { name: 'About this experience' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Booking notes' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Book now' })).toBeVisible();
  await expect(page.getByText('Price per person')).toBeVisible();
  await expect(page.getByText('體驗介紹')).toHaveCount(0);
});

test('預設中文 /experiences/[slug] 中文', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  const resp = await page.goto(`/experiences/${SLUG}`);
  expect(resp?.status()).toBeLessThan(400);
  expect(new URL(page.url()).pathname).toBe(`/experiences/${SLUG}`);
  await expect(page.getByRole('heading', { name: '體驗介紹' })).toBeVisible();
});
