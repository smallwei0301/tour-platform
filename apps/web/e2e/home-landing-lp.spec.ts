/**
 * 祕島 LP 首頁改版 — Landing Page smoke
 *
 * 驗證新版一頁式行銷首頁（深綠×古紙×黃銅）的關鍵區塊與 RWD：
 * 1. Hero 標語／CTA
 * 2. 主題探索四卡
 * 3. 編輯精選行程卡
 * 4. 在地嚮導＋信任徽章
 * 5. 古紙結尾 CTA
 * 6. 375px–1440px 無水平捲軸
 *
 * 純前端靜態內容，不需 Supabase seed。
 */
import { test, expect } from './helpers';

test.describe('祕島 LP 首頁', () => {
  test('Hero 顯示品牌標語與 CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.lp-hero h1')).toContainText('島嶼深處');
    await expect(page.locator('.lp-hero h1')).toContainText('有故事的人');
    await expect(page.locator('.lp-hero-sub')).toContainText('在地嚮導 × 深度路線 × 真實相遇');
    const cta = page.locator('[data-testid="home-cta-explore"]');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText(/探索祕島旅程/);
    await expect(cta).toHaveAttribute('href', '/activities');
  });

  test('主題探索顯示四張主題卡', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.lp-theme-card');
    await expect(cards).toHaveCount(4);
    for (const t of ['山徑', '海岸', '部落', '茶香']) {
      await expect(page.locator('.lp-theme-title', { hasText: t })).toBeVisible();
    }
    await expect(cards.first()).toHaveAttribute('href', /\/activities/);
  });

  test('編輯精選卡顯示行程資訊', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.lp-feat-card');
    await expect(card.locator('.lp-feat-title')).toHaveText('柴山探洞・城市祕境');
    await expect(card.locator('.lp-feat-subtitle')).toHaveText('走進城市邊緣的地形祕境');
    await expect(card.locator('.lp-feat-rating')).toContainText('4.9');
    await expect(card.locator('.lp-feat-price')).toContainText('NT$ 2,000');
  });

  test('嚮導故事與四張信任徽章', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.lp-guide-name')).toContainText('Andy Lee');
    await expect(page.locator('.lp-trust-card')).toHaveCount(4);
    for (const t of ['身份驗證', '人工審核', '安心出行', '5星好評']) {
      await expect(page.locator('.lp-trust-card', { hasText: t })).toBeVisible();
    }
  });

  test('融合區塊：更多行程／目的地／旅人故事／FAQ', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.lp-tour-card')).toHaveCount(2);
    await expect(page.locator('.lp-tour-title').first()).toContainText('大稻埕');
    await expect(page.locator('.lp-dest-card')).toHaveCount(8);
    await expect(page.locator('.lp-dest-card').first()).toContainText('台北');
    await expect(page.locator('.lp-story-card')).toHaveCount(3);
    await expect(page.locator('.lp-faq-item')).toHaveCount(6);
    // FAQ 展開互動
    const firstFaq = page.locator('.lp-faq-item').first();
    await firstFaq.locator('summary').click();
    await expect(firstFaq.locator('p')).toBeVisible();
  });

  test('古紙結尾 CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.lp-closing-title')).toHaveText('你的祕島故事，從這裡開始');
    await expect(page.locator('.lp-closing .lp-btn')).toHaveText(/開始探索祕島旅程/);
  });

  for (const width of [375, 768, 1440]) {
    test(`RWD ${width}px 無水平捲軸`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
});
