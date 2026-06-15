import { test, expect } from '@playwright/test';

/**
 * 行程頁收藏愛心 + 列表真實星數 + 評價照片。
 *
 * 詳情頁與列表頁皆為 server render；dev 無 Supabase env 時走 in-memory fixture
 * （`src/fixtures/data.ts` 的 kaohsiung-chaishan-cave-experience：4 真實評論 + 4 口碑語錄，
 *   且 r1「小美」帶 2 張照片），故不需 page.route mock。
 */

const REGION_PATH = '/activities/kaohsiung';
const DETAIL_PATH = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';

test.describe('收藏愛心圖示正常顯示', () => {
  test('列表卡的收藏愛心是可見的圓形按鈕（非空白方塊）', async ({ page }) => {
    await page.goto(REGION_PATH);

    const card = page.locator('[data-testid="activity-card"]', { hasText: '柴山' }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    const heart = card.locator('[data-testid="wishlist-toggle"]');
    await expect(heart).toBeVisible();

    // 本專案無 Tailwind：愛心改用 inline style，需有明確尺寸與圓角（否則渲染成空白方塊）。
    const box = await heart.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(20);
    expect(box?.height ?? 0).toBeGreaterThan(20);
    const radius = await heart.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(radius).not.toBe('0px');

    // 內含愛心 SVG，且有實際尺寸
    const svg = heart.locator('svg');
    await expect(svg).toBeVisible();
  });
});

test.describe('列表顯示詳情頁的真實星數與評價數', () => {
  test('柴山卡顯示真實星數與則數（與詳情頁同源，非寫死 5.0(0則)）', async ({ page }) => {
    await page.goto(REGION_PATH);

    const card = page.locator('[data-testid="activity-card"]', { hasText: '柴山' }).first();
    const rating = card.locator('[data-testid="activity-card-rating"]');
    await expect(rating).toBeVisible({ timeout: 10_000 });

    // fixture：4 真實評論 + 4 口碑語錄 = 8（與詳情頁「共 8 則評論」一致）
    await expect(rating).toContainText('(8則)');
    await expect(rating).not.toContainText('尚無評價');
  });

  test('評分星星為實心（fill=currentColor）', async ({ page }) => {
    await page.goto(REGION_PATH);
    const card = page.locator('[data-testid="activity-card"]', { hasText: '柴山' }).first();
    const star = card.locator('[data-testid="activity-card-rating"] svg').first();
    await expect(star).toBeVisible({ timeout: 10_000 });
    await expect(star).toHaveAttribute('fill', 'currentColor');
  });

  test('導遊認證標章為平台黃金色（#b08d3e → rgb(176,141,62)）', async ({ page }) => {
    await page.goto(REGION_PATH);
    const card = page.locator('[data-testid="activity-card"]', { hasText: '柴山' }).first();
    await card.waitFor({ timeout: 10_000 });
    // 卡片內至少有一個 svg（認證標章）採平台黃金色
    const colors = await card.locator('svg').evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).color.replace(/\s/g, '')),
    );
    expect(colors).toContain('rgb(176,141,62)');
  });
});

test.describe('旅客評價照片（響應式橫向滑動）', () => {
  test('詳情頁評論卡顯示上傳的照片，且容器可橫向滑動', async ({ page }) => {
    await page.goto(DETAIL_PATH);

    const meiCard = page.locator('#section-reviews .kkd-review-card', { hasText: '小美' });
    await expect(meiCard).toBeVisible({ timeout: 10_000 });

    const photos = meiCard.locator('[data-testid="review-photos"]');
    await expect(photos).toBeVisible();
    await expect(photos.locator('img')).toHaveCount(2);

    // 響應式：多張照片以橫向卷軸呈現（overflow-x: auto）
    const overflowX = await photos.evaluate((el) => getComputedStyle(el).overflowX);
    expect(['auto', 'scroll']).toContain(overflowX);
  });

  test('後台暖場評論（社群口碑語錄）的照片也以橫向卷軸呈現', async ({ page }) => {
    await page.goto(DETAIL_PATH);
    // fixture：陳小姐 口碑語錄帶 2 張照片
    const warmCard = page.locator('#section-reviews .kkd-review-card', { hasText: '陳小姐' });
    await expect(warmCard).toBeVisible({ timeout: 10_000 });
    const photos = warmCard.locator('[data-testid="review-photos"]');
    await expect(photos).toBeVisible();
    await expect(photos.locator('img')).toHaveCount(2);
    const overflowX = await photos.evaluate((el) => getComputedStyle(el).overflowX);
    expect(['auto', 'scroll']).toContain(overflowX);
  });

  test('手機視窗下評價照片仍橫向滑動、不溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(DETAIL_PATH);

    const meiCard = page.locator('#section-reviews .kkd-review-card', { hasText: '小美' });
    const photos = meiCard.locator('[data-testid="review-photos"]');
    await expect(photos).toBeVisible({ timeout: 10_000 });

    const overflowX = await photos.evaluate((el) => getComputedStyle(el).overflowX);
    expect(['auto', 'scroll']).toContain(overflowX);
    // 容器寬度受限於視窗，照片以滑動而非換行/撐破版面呈現
    const box = await photos.boundingBox();
    expect(box?.width ?? 999).toBeLessThanOrEqual(390);
  });
});
