import { test, expect } from './helpers';

/**
 * 社群口碑語錄（結構化）× 真實評論整合呈現。
 *
 * 詳情頁為 server render（dev 無 Supabase env 時走 in-memory fixture，
 * `src/fixtures/data.ts` 的 kaohsiung-chaishan-cave-experience），故不需 page.route mock。
 *
 * 驗證：
 * - 後台社群口碑語錄可帶「人名 + 星數 + 內容」，前台以與真實評論相同的卡片樣式呈現。
 * - 人名留空的舊資料 fallback 顯示「旅客回饋」。
 * - 「共 N 則評論」= 真實已核准評論 + 口碑語錄（前台整合後的單一可見數字）。
 */

const DETAIL_PATH = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';

test.describe('社群口碑語錄 × 真實評論整合', () => {
  test('結構化口碑語錄帶人名與星數，與真實評論相同卡片樣式', async ({ page }) => {
    await page.goto(DETAIL_PATH);

    const reviewSection = page.locator('#section-reviews');
    await expect(reviewSection).toBeVisible();

    // 結構化口碑語錄：自訂人名 + 對應星數
    const namedCard = reviewSection.locator('.kkd-review-card', { hasText: '陳小姐' });
    await expect(namedCard).toBeVisible();
    await expect(namedCard.locator('.kkd-stars')).toHaveText('★★★★★');

    const yukiCard = reviewSection.locator('.kkd-review-card', { hasText: '日本旅客 Yuki' });
    await expect(yukiCard).toBeVisible();
    await expect(yukiCard.locator('.kkd-stars')).toHaveText('★★★★');

    // 真實評論卡片仍正常呈現（與口碑語錄同樣式）
    await expect(reviewSection.locator('.kkd-review-card', { hasText: '小美' })).toBeVisible();
  });

  test('人名留空的舊資料 fallback 顯示「旅客回饋」', async ({ page }) => {
    await page.goto(DETAIL_PATH);
    const reviewSection = page.locator('#section-reviews');
    await expect(reviewSection.locator('.kkd-reviewer', { hasText: '旅客回饋' }).first()).toBeVisible();
  });

  test('「共 N 則評論」整合真實評論 + 口碑語錄', async ({ page }) => {
    await page.goto(DETAIL_PATH);
    const total = page.locator('#section-reviews .kkd-reviews-total');
    // fixture：4 真實評論 + 4 口碑語錄 = 8
    await expect(total).toHaveText(/共\s*8\s*則評論/);
  });
});
