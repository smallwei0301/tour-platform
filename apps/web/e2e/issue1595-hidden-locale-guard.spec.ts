import { test, expect } from '@playwright/test';

/**
 * Issue #1595 — 未開站 locale（ja/ko）render 但帶 noindex；可見 locale（zh-Hant/en）可索引。
 *
 * 未開站語言若讓搜尋引擎收錄滿頁 zh-Hant fallback 的半成品，會傷站點品質。
 * 本區段經 middleware(next-intl) rewrite 進入，rewrite 下游 notFound() 只能 soft-404，
 * 故以 noindex（不依賴狀態碼）為守門。退場門檻＝把該 locale 加入 VISIBLE_LOCALES。
 */

function robotsMeta(page: import('@playwright/test').Page) {
  return page.locator('meta[name="robots"]').first().getAttribute('content');
}

test.describe('issue1595 未開站 locale noindex guard', () => {
  test('T1595.E1 — /ja、/ja/activities 帶 noindex', async ({ page }) => {
    await page.goto('/ja');
    expect(await robotsMeta(page)).toContain('noindex');
    await page.goto('/ja/activities');
    expect(await robotsMeta(page)).toContain('noindex');
  });

  test('T1595.E2 — /ko 帶 noindex', async ({ page }) => {
    await page.goto('/ko');
    expect(await robotsMeta(page)).toContain('noindex');
  });

  test('T1595.E3 — 可見 locale 可索引：/（zh-Hant）與 /en 不帶 noindex', async ({ page }) => {
    await page.goto('/');
    expect(await robotsMeta(page) ?? '').not.toContain('noindex');
    await page.goto('/en');
    expect(await robotsMeta(page) ?? '').not.toContain('noindex');
  });

  test('T1595.E4 — 非法 locale（/xx）不可索引（notFound 內容＋noindex）', async ({ page }) => {
    // [locale] dynamic segment 會吃下 /xx（locale=xx），layout 對非四語系 notFound；
    // 因經 middleware rewrite 進入而為 soft-404（HTTP 200），但同時帶 noindex，
    // 且 not-found 頁本身 robots index:false——搜尋引擎不會收錄。
    await page.goto('/xx');
    expect(await robotsMeta(page)).toContain('noindex');
  });
});
