import { test, expect } from './helpers';

/**
 * #multilingual — 首頁（LP）英文版手機版面回歸：較長的英文字串過去造成
 * hero 側標重疊、主題卡標題破框、信任徽章被裁切。修正以 [data-locale="en"]
 * 範圍化，zh 不受影響。本 spec 鎖定：en 手機不溢出、zh 裝飾維持。
 */

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3333';
const PHONE = { width: 393, height: 900 };

async function setLocale(page: import('@playwright/test').Page, locale: string) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
}

test.describe('@multilingual home LP overflow (en mobile)', () => {
  test.use({ viewport: PHONE });

  test('en：hero 裝飾側標在手機隱藏（避免壓到較長英文標題）', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/en');
    await expect(page.locator('.lp-hero-vert')).toBeHidden();
  });

  test('en：主題卡標題不破框（scrollWidth ≤ clientWidth）', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/en');
    const titles = page.locator('.lp-theme-title');
    const n = await titles.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const m = await titles.nth(i).evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(m.sw, `theme title #${i} overflows`).toBeLessThanOrEqual(m.cw + 1);
    }
    // 英文版冗餘小標應隱藏
    await expect(page.locator('.lp-theme-sub').first()).toBeHidden();
  });

  test('en：信任徽章文字不被裁切（卡片高度自適應、無水平溢出）', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/en');
    const cards = page.locator('.lp-trust-card');
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const m = await cards.nth(i).evaluate((el) => ({
        sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight,
      }));
      expect(m.sw, `trust card #${i} horizontal clip`).toBeLessThanOrEqual(m.cw + 1);
      expect(m.sh, `trust card #${i} vertical clip`).toBeLessThanOrEqual(m.ch + 1);
    }
  });

  test('zh：裝飾側標維持顯示（en-only 修正未波及繁中）', async ({ page }) => {
    await setLocale(page, 'zh-Hant');
    await page.goto('/');
    await expect(page.locator('.lp-hero-vert')).toBeVisible();
    // 繁中主題卡保留英文小標
    await expect(page.locator('.lp-theme-sub').first()).toBeVisible();
  });
});
