import { test, expect } from './helpers';
import type { Page } from '@playwright/test';

/**
 * #multilingual — /checkout 入口的中英 i18n smoke（真實瀏覽器）。
 *
 * 產品現況（#1407 legacy checkout 退役後）：`/checkout?slug=…` 由 next.config
 * 永久重導（308）至 V2 booking 頁 `/booking/[slug]`；未帶 plan 參數時，V2 頁
 * 顯示「缺少或無法判定方案參數」引導文案（i18n key `missingPlanParam`）。
 * 本 spec 原測已退役的 legacy 結帳頁 UI（聯絡人資料／建立訂單），#1649 QA 時
 * 改寫為鎖定現行契約：redirect 保留＋引導文案雙語正確。
 * （完整 V2 訂購流程 i18n 由 issue-multilingual-order-flow 與 booking 系列涵蓋。）
 */

const SLUG = 'kaohsiung-chaishan-cave-experience';

async function setLocale(page: Page, locale: string) {
  await page.context().addCookies([
    { name: 'NEXT_LOCALE', value: locale, url: process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3333' },
  ]);
}

test.describe('@multilingual /checkout i18n', () => {
  test('zh-Hant：/checkout 重導 V2 booking，未帶 plan 顯示繁中引導', async ({ page }) => {
    await setLocale(page, 'zh-Hant');
    await page.goto(`/checkout?slug=${SLUG}`);
    await expect(page).toHaveURL(new RegExp(`/booking/${SLUG}`));
    await expect(page.getByText('缺少或無法判定方案參數')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'test-results/checkout-zh.png', fullPage: true });
  });

  test('en：/checkout 重導 V2 booking，未帶 plan 顯示英文引導', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto(`/checkout?slug=${SLUG}`);
    await expect(page).toHaveURL(new RegExp(`/booking/${SLUG}`));
    await expect(page.getByText('Missing or unresolvable plan parameter')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'test-results/checkout-en.png', fullPage: true });
  });
});
