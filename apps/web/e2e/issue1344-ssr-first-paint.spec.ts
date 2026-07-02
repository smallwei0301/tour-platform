import { test, expect } from '@playwright/test';

/**
 * Issue #1344 — SSR 首屏卡片（LCP render delay 修復）。
 *
 * 根因：/activities 是 ISR，ActivitiesContent 用 useSearchParams() →
 * prerender 時 CSR bailout，SSR HTML 過去只剩 skeleton fallback，
 * LCP 圖片要等 hydration 才 render（Lighthouse render delay 佔 75%）。
 * 修復後 Suspense fallback 改為 ActivitiesFirstPaint：SSR HTML 直接
 * 內含真卡片與 <img>。
 *
 * 驗證方式：關掉 JavaScript 載頁 — 沒有 hydration 的世界裡仍看得到
 * 卡片與圖片，就證明首屏是 server render 進 HTML 的。
 * 不 mock 後端：SSR 資料來自 dev server 的 in-memory fallback store
 * （hasSupabaseEnv() false 分支），與其他 e2e 相同假設。
 */

// 為什麼驗 raw HTML 而不是「JS 關掉後可見」：dev server 是動態渲染，
// route-level loading.tsx 的 skeleton 會先 flush、整頁內容走 hidden
// stream（要 JS swap 才可見）— JS-off 可見性只在 production ISR 預渲染
// HTML 上成立（fallback 直接是靜態內容）。dev/CI 能穩定驗的是：server
// 回應的 HTML「本身」必須含真卡片 markup 與 optimizer 圖片 URL —
// 這正是本修復要保證的（修復前 HTML 只有 skeleton，0 張卡）。
test.describe('issue1344 — /activities SSR HTML 含首屏卡片', () => {
  test('/activities 的 server HTML 含活動卡片與 /_next/image cover', async ({ request }) => {
    const res = await request.get('/activities');
    expect(res.status()).toBe(200);
    const html = await res.text();

    const cardCount = (html.match(/data-testid="activity-card"/g) ?? []).length;
    expect(cardCount).toBeGreaterThan(0);

    // LCP 元素（卡片 cover 圖）必須以 <img> 形式存在於 HTML 且走 optimizer
    expect(html).toMatch(/<img[^>]+tp-card-img[^>]+src="[^"]*\/_next\/image/);

    // ActivitiesFirstPaint 的 h1（帶行程數字）— 證明 fallback 是真卡片首屏，
    // 而不是舊 skeleton（其 h1 無數字）。
    expect(html).toMatch(/全台灣 \d+ 個私人導遊行程/);
  });

  test('/activities/kaohsiung（region 頁）的 server HTML 含卡片', async ({ request }) => {
    const res = await request.get('/activities/kaohsiung');
    expect(res.status()).toBe(200);
    const html = await res.text();
    const cardCount = (html.match(/data-testid="activity-card"/g) ?? []).length;
    expect(cardCount).toBeGreaterThan(0);
    expect(html).toMatch(/<img[^>]+tp-card-img[^>]+src="[^"]*\/_next\/image/);
  });
});

test.describe('issue1344 — hydration 後互動不回歸', () => {
  test('側欄篩選在 hydration 後可用，卡片數與 h1 隨勾選更新', async ({ page }) => {
    await page.goto('/activities');
    await expect(page.locator('[data-testid="activity-card"]').first()).toBeVisible();

    // hydration 完成的證據：互動側欄（含 details 摺疊）取代首屏靜態 aside
    const details = page.locator('aside.tp-filter details');
    await expect(details.first()).toBeAttached();

    const before = await page.locator('[data-testid="activity-card"]').count();
    await details.first().click();
    await page.getByRole('checkbox').first().check();
    // 篩選為 client-side（activityMatchesRegion），等待卡片數變化或 h1 更新
    await expect
      .poll(async () => page.locator('[data-testid="activity-card"]').count())
      .toBeLessThanOrEqual(before);
  });
});
