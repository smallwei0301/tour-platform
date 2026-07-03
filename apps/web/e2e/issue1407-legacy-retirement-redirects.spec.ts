import { test, expect } from '@playwright/test';

/**
 * Issue #1407 — Legacy 退役階段三：舊路徑 301 redirect 真實瀏覽器驗證。
 *
 * 退役後 /checkout 與 /orders 頁面已刪除，next.config redirects 需保護
 * 外部書籤與搜尋引擎既有索引：
 *  - /checkout?slug=X → /booking/X（帶方案回 V2 入口）
 *  - /checkout        → /activities
 *  - /orders          → /me/orders
 *  - /orders/[id]     → /me/orders/[id]
 */

test.describe('issue1407 legacy 路徑 redirect', () => {
  test('T1407.E1 — /checkout?slug=X 301 → /booking/X', async ({ page }) => {
    await page.goto('/checkout?slug=kaohsiung-chaishan-cave-experience');
    await page.waitForURL('**/booking/kaohsiung-chaishan-cave-experience**');
    expect(new URL(page.url()).pathname).toBe('/booking/kaohsiung-chaishan-cave-experience');
  });

  test('T1407.E2 — /checkout（無 slug）→ /activities', async ({ page }) => {
    await page.goto('/checkout');
    await page.waitForURL('**/activities**');
    expect(new URL(page.url()).pathname).toBe('/activities');
  });

  test('T1407.E3 — /orders → /me/orders', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForURL('**/me/orders**');
    expect(new URL(page.url()).pathname).toBe('/me/orders');
  });

  test('T1407.E4 — /orders/[id] → /me/orders/[id]', async ({ page }) => {
    await page.goto('/orders/ord_e2e_1407');
    await page.waitForURL('**/me/orders/ord_e2e_1407**');
    expect(new URL(page.url()).pathname).toBe('/me/orders/ord_e2e_1407');
  });

  test('T1407.E5 — redirect 為 301 permanent（保 SEO 權重轉移）', async ({ request }) => {
    const res = await request.get('/orders', { maxRedirects: 0 });
    expect(res.status()).toBe(308); // next.config permanent redirect = 308
    expect(res.headers()['location']).toContain('/me/orders');
  });
});
