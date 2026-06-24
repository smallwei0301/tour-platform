import { test, expect } from '@playwright/test';

/**
 * #multilingual 全面搬遷 — blog + legal i18n smoke。
 *
 * blog（含 [slug]）與 legal（privacy/terms/refund）已搬進 [locale]。
 * blog 文章本文為內容（維持中文），只驗 chrome；legal 全英譯。
 * 種 NEXT_LOCALE cookie 讓 localeDetection 可預期。
 */

async function setLocaleCookie(page: import('@playwright/test').Page, value: string) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value, domain: '127.0.0.1', path: '/' }]);
}

const LEGAL = [
  { slug: 'legal/privacy', zh: '隱私政策', en: 'Privacy Policy' },
  { slug: 'legal/terms', zh: '服務條款', en: 'Terms of Service' },
  { slug: 'legal/refund', zh: '退款政策', en: 'Refund Policy' },
];

for (const c of LEGAL) {
  test(`預設中文 /${c.slug} 中文 H1`, async ({ page }) => {
    await setLocaleCookie(page, 'zh-Hant');
    const resp = await page.goto(`/${c.slug}`);
    expect(resp?.status()).toBeLessThan(400);
    expect(new URL(page.url()).pathname).toBe(`/${c.slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(c.zh);
  });

  test(`英文 /en/${c.slug} 英文 H1`, async ({ page }) => {
    await setLocaleCookie(page, 'en');
    const resp = await page.goto(`/en/${c.slug}`);
    expect(resp?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(c.en);
  });
}

test('blog 列表：預設中文 vs /en chrome 切換', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  await page.goto('/blog');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('旅遊指南');

  await setLocaleCookie(page, 'en');
  await page.goto('/en/blog');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Travel Guide');
});

test('blog 文章頁 chrome 英文化（本文維持中文內容）', async ({ page }) => {
  await setLocaleCookie(page, 'en');
  // 從英文列表抓第一篇文章連結
  await page.goto('/en/blog');
  const firstPost = page.locator('a[href*="/blog/"]').first();
  await expect(firstPost).toBeVisible();
  const href = await firstPost.getAttribute('href');
  const resp = await page.goto(href!);
  expect(resp?.status()).toBeLessThan(400);
  // breadcrumb chrome 英文（麵包屑含 Travel Guide）
  await expect(page.getByText('Travel Guide').first()).toBeVisible();
});
