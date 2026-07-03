import { test, expect } from './helpers';

// /for-guides — 導遊開店 landing（非 localized root 路徑，靜態頁）。
// 驗：Hero 主張、Beta 定價（NT$0＋15%）、FAQ、CTA 指向既有 /guide/apply、Navbar 有入口。

test('導遊開店 landing：主張、定價、FAQ、CTA 到 /guide/apply', async ({ page }) => {
  await page.goto('/for-guides');

  // Hero
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('把你熟的路，變成你的預約頁');

  // 定價卡：Beta 免月費＋15% 服務費
  const pricing = page.getByTestId('fg-pricing');
  await expect(pricing).toContainText('NT$0');
  await expect(pricing).toContainText('15% 平台服務費');
  await expect(pricing).toContainText('沒有成交，不收一毛錢');

  // FAQ 至少 4 題且可展開
  const faq = page.getByTestId('fg-faq');
  await expect(faq.locator('details')).toHaveCount(4);
  await faq.locator('summary').first().click();
  await expect(faq.locator('details p').first()).toBeVisible();

  // 主要 CTA 指向既有申請表單頁（/guide/apply 本輪不改）
  const ctas = page.getByRole('link', { name: '免費開通我的預約頁' });
  await expect(ctas.first()).toHaveAttribute('href', '/guide/apply');
  await expect(page.getByRole('link', { name: '登入導遊後台' })).toHaveAttribute('href', '/guide/login');
});

test('Navbar 有「導遊開店」入口且連到 /for-guides', async ({ page }) => {
  await page.goto('/');
  const navLink = page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: '導遊開店' });
  await expect(navLink).toHaveAttribute('href', '/for-guides');
});
