import { test, expect } from '@playwright/test';

/**
 * 評價照片 in-page 燈箱（真實瀏覽器）。
 *
 * 需求：點口碑評論／旅客評論的照片時，在當頁彈出小視窗檢視大圖，不另開分頁，
 * 並符合響應式。dev server 無 Supabase 時詳情頁由 fixtures 渲染，
 * `kaohsiung-chaishan-cave-experience` 同時含旅客評論照片與暖場口碑照片。
 */
const DETAIL_URL = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';

test.describe('評價照片燈箱', () => {
  test('點縮圖在當頁開燈箱（不另開分頁）、可切換與關閉', async ({ page, context }) => {
    await page.goto(DETAIL_URL);

    const firstPhoto = page.locator('[data-testid="review-photos"] .kkd-review-photo').first();
    await firstPhoto.scrollIntoViewIfNeeded();
    await expect(firstPhoto).toBeVisible({ timeout: 15_000 });

    // 縮圖是 <button>，不是會另開分頁的 <a target="_blank">
    expect(await firstPhoto.evaluate((el) => el.tagName)).toBe('BUTTON');
    await expect(page.locator('[data-testid="review-photos"] a[target="_blank"]')).toHaveCount(0);

    const pagesBefore = context.pages().length;
    await firstPhoto.click();

    // 燈箱在當頁彈出
    const lightbox = page.locator('[data-testid="review-lightbox"]');
    await expect(lightbox).toBeVisible();
    await expect(page.locator('[data-testid="review-lightbox-img"]')).toBeVisible();
    // 沒有開出新分頁
    expect(context.pages().length).toBe(pagesBefore);
    // 背景捲動被鎖
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    // 該則評論有多張 → 有計數器，可用鍵盤切換
    const counter = page.locator('[data-testid="review-lightbox-counter"]');
    await expect(counter).toHaveText('1 / 2');
    const firstSrc = await page.locator('[data-testid="review-lightbox-img"]').getAttribute('src');
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('2 / 2');
    expect(await page.locator('[data-testid="review-lightbox-img"]').getAttribute('src')).not.toBe(firstSrc);

    // 圖片以 contain 限制在視窗內（響應式不溢出）
    const fits = await page.locator('[data-testid="review-lightbox-img"]').evaluate((img) => {
      const r = img.getBoundingClientRect();
      return r.width <= window.innerWidth + 1 && r.height <= window.innerHeight + 1;
    });
    expect(fits).toBe(true);

    // ESC 關閉並還原背景捲動
    await page.keyboard.press('Escape');
    await expect(lightbox).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });

  test('手機視窗：點背景與關閉鈕都能關燈箱', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(DETAIL_URL);

    const firstPhoto = page.locator('[data-testid="review-photos"] .kkd-review-photo').first();
    await firstPhoto.scrollIntoViewIfNeeded();
    await firstPhoto.click();

    const lightbox = page.locator('[data-testid="review-lightbox"]');
    await expect(lightbox).toBeVisible();

    // 點圖片本身不關閉
    await page.locator('[data-testid="review-lightbox-img"]').click();
    await expect(lightbox).toBeVisible();

    // 關閉鈕關閉
    await page.locator('[data-testid="review-lightbox-close"]').click();
    await expect(lightbox).toHaveCount(0);

    // 再開一次 → 點背景（左上角）關閉
    await firstPhoto.click();
    await expect(lightbox).toBeVisible();
    await lightbox.click({ position: { x: 8, y: 8 } });
    await expect(lightbox).toHaveCount(0);
  });
});
