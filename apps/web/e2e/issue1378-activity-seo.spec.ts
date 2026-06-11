import { test, expect } from './helpers';

/**
 * Issue #1378 — 活動詳情頁 Product JSON-LD + OG image 用活動封面。
 *
 * 詳情頁為 server render（dev 無 Supabase env 時走 in-memory fixture，
 * `src/fixtures/data.ts` 的 kaohsiung-chaishan-cave-experience），
 * 故不需 page.route mock — 直接驗證 SSR 輸出的 head meta 與 ld+json。
 */

const DETAIL_PATH = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';

async function readJsonLdBlocks(page: import('@playwright/test').Page) {
  return page.$$eval('script[type="application/ld+json"]', (nodes) =>
    nodes.map((n) => JSON.parse(n.textContent || 'null'))
  );
}

test.describe('issue1378 activity SEO', () => {
  test('詳情頁含 Product JSON-LD（Offer/TWD），fixture 無評論故無 aggregateRating', async ({ page }) => {
    await page.goto(DETAIL_PATH);

    const blocks = await readJsonLdBlocks(page);
    const product = blocks.find((b) => b && b['@type'] === 'Product');
    expect(product, `ld+json blocks: ${JSON.stringify(blocks.map((b) => b && b['@type']))}`).toBeTruthy();

    expect(product.name).toContain('柴山');
    expect(product.offers['@type']).toBe('Offer');
    expect(product.offers.priceCurrency).toBe('TWD');
    expect(Number(product.offers.price)).toBeGreaterThan(0);
    expect(product.url).toContain(DETAIL_PATH);

    // fixture 活動無 top-level ratingAvg/reviewCount → 不得輸出 aggregateRating（Google 規範）
    expect(product.aggregateRating).toBeUndefined();

    // 既有 schema 不受影響
    expect(blocks.some((b) => b && b['@type'] === 'BreadcrumbList')).toBe(true);
    expect(blocks.some((b) => b && b['@type'] === 'TouristAttraction')).toBe(true);
  });

  test('og:image 為活動封面（fixture imageUrl），title 為真實活動名', async ({ page }) => {
    await page.goto(DETAIL_PATH);

    const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(ogImage).toContain('images.unsplash.com/photo-1551632811-561732d1e306');

    const ogTitle = await page.locator('meta[property="og:title"]').first().getAttribute('content');
    expect(ogTitle).toContain('柴山');
    expect(ogTitle).toContain('Midao');

    await expect(page).toHaveTitle(/柴山/);
  });
});
