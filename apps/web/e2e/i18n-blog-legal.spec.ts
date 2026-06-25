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

test('blog 列表：chrome 與文章標題／摘要實際 zh↔en 切換', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  await page.goto('/blog');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('旅遊指南');
  await expect(page.getByText('為什麼在台灣旅行要找私人導遊')).toBeVisible();

  await setLocaleCookie(page, 'en');
  await page.goto('/en/blog');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Travel Guide');
  // 文章標題／摘要實際英文，舊中文標題消失
  await expect(page.getByText('Why hire a private guide in Taiwan')).toBeVisible();
  await expect(page.getByText('為什麼在台灣旅行要找私人導遊')).toHaveCount(0);
});

test('blog 文章頁 chrome＋本文皆英文化（/en）', async ({ page }) => {
  await setLocaleCookie(page, 'en');
  const resp = await page.goto('/en/blog/why-private-guide');
  expect(resp?.status()).toBeLessThan(400);
  // breadcrumb chrome 英文
  await expect(page.getByText('Travel Guide').first()).toBeVisible();
  // H1 與本文英文
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Why hire a private guide in Taiwan');
  await expect(page.getByRole('heading', { name: 'What a private guide changes' })).toBeVisible();
  await expect(page.getByText('You control the pace')).toBeVisible();
  // 中文本文已不在
  await expect(page.getByText('大多數人對旅行團的印象')).toHaveCount(0);
});

test('blog 文章頁 預設中文本文維持中文', async ({ page }) => {
  await setLocaleCookie(page, 'zh-Hant');
  const resp = await page.goto('/blog/why-private-guide');
  expect(resp?.status()).toBeLessThan(400);
  await expect(page.getByRole('heading', { name: '私人導遊帶來的改變' })).toBeVisible();
});
