import { test, expect } from '@playwright/test';

/**
 * #multilingual 全面搬遷 — 活動詳情頁 page.tsx chrome i18n smoke。
 *
 * 詳情頁本體（section 標題、費用、退款、CTA 等 page-level chrome）英文化；
 * 活動標題／描述／方案等 DB 資料維持原文；booking 子元件為後續批次。
 */

async function setLocaleCookie(page: import('@playwright/test').Page, value: string) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value, domain: '127.0.0.1', path: '/' }]);
}

async function firstActivityHref(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/activities');
  const link = page.getByTestId('activity-card-link').first();
  await expect(link).toBeVisible();
  return (await link.getAttribute('href'))!;
}

test('英文活動詳情頁 page chrome 英文化', async ({ page }) => {
  await setLocaleCookie(page, 'en');
  const href = await firstActivityHref(page);
  const resp = await page.goto(`/en${href}`);
  expect(resp?.status()).toBeLessThan(400);
  // page-level section headings (在 page.tsx，非 booking 子元件)
  await expect(page.getByRole('heading', { name: 'Tour details' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Good to know' })).toBeVisible();
  // 確認對應中文標題已不在
  await expect(page.getByText('商品說明', { exact: true })).toHaveCount(0);
});

test('預設中文活動詳情頁中文', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  const href = await firstActivityHref(page);
  const resp = await page.goto(href);
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.getByRole('heading', { name: '商品說明' })).toBeVisible();
});
