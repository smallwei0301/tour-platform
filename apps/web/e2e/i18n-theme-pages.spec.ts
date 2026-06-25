import { test, expect } from '@playwright/test';

/**
 * #multilingual 全面搬遷 — /theme/* 主題頁 i18n browser smoke。
 *
 * 5 個主題頁已搬進 app/[locale]/theme/*。驗證預設 zh（無前綴）渲染中文、
 * /en/theme/* 渲染英文，hero 標題與「查看行程／View tour」連結實際切換。
 *
 * 公開頁，無需 auth；種 NEXT_LOCALE cookie 讓 localeDetection 結果可預期。
 */

async function setLocaleCookie(page: import('@playwright/test').Page, value: string) {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value, domain: '127.0.0.1', path: '/' }]);
}

const CASES = [
  { slug: 'cave-exploration', zh: '鑽進高雄的秘密地下世界', en: "Into Kaohsiung's hidden underground" },
  { slug: 'mountain-wilderness', zh: '走進台灣的山林深處', en: "Deep into Taiwan's mountains and forests" },
];

for (const c of CASES) {
  test(`預設中文 /theme/${c.slug} 渲染中文 hero`, async ({ page }) => {
    await setLocaleCookie(page, 'zh-Hant');
    const resp = await page.goto(`/theme/${c.slug}`);
    expect(resp?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(c.zh);
  });

  test(`英文 /en/theme/${c.slug} 渲染英文 hero + View tour`, async ({ page }) => {
    await setLocaleCookie(page, 'en');
    const resp = await page.goto(`/en/theme/${c.slug}`);
    expect(resp?.status()).toBeLessThan(400);
    expect(page.url()).toContain(`/en/theme/${c.slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(c.en);
    await expect(page.getByText('View tour', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(c.zh)).toHaveCount(0);
  });
}
