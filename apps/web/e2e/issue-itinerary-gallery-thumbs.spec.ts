import { test, expect } from '@playwright/test';

/**
 * 電腦版活動照片相簿：左側大圖 + 右側可垂直捲動的縮圖列；點縮圖即把該張切成大圖。
 *  - 縮圖列可捲動 → 所有照片皆可瀏覽（不再只顯示前 4 張）。
 *  - 點右側縮圖 → 左側大圖換成該張（「選擇後左邊大圖變為小圖」）。
 * 手機維持既有的左右滑動輪播（不受影響）。
 *
 * 詳情頁為 server render；dev 走 in-memory fixture（kaohsiung-chaishan-cave-experience）。
 */

const DETAIL_PATH = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';
const DESKTOP = { width: 1280, height: 900 };

test.describe('電腦版活動照片：大圖 + 可捲動縮圖列（點選切換）', () => {
  test('電腦版顯示大圖 + 縮圖列，且縮圖列為可垂直捲動容器', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(DETAIL_PATH);

    const desktopGallery = page.locator('.kkd-gallery-desktop');
    await expect(desktopGallery).toBeVisible({ timeout: 10_000 });

    // 手機輪播在桌機隱藏
    await expect(page.locator('.kkd-carousel-track')).toBeHidden();

    // 大圖存在，且維持 ~16:9 比例（不被壓成寬扁而裁切上下）
    const mainWrap = page.locator('.kkd-gallery-main-wrap');
    await expect(mainWrap).toBeVisible();
    const box = await mainWrap.boundingBox();
    expect(box).toBeTruthy();
    const ratio = (box!.width) / (box!.height);
    // 16:9 ≈ 1.778；容忍 sub-pixel 誤差
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(1.85);

    // 右側縮圖列為垂直可捲動容器（捲動由內層 .kkd-gallery-thumbs-inner 負責）
    const thumbs = page.locator('.kkd-gallery-thumbs');
    await expect(thumbs).toBeVisible();
    const thumbsInner = page.locator('.kkd-gallery-thumbs-inner');
    const overflowY = await thumbsInner.evaluate((el) => getComputedStyle(el).overflowY);
    expect(['auto', 'scroll']).toContain(overflowY);

    // 每張照片都是一個縮圖按鈕（全部可瀏覽，非只前 4 張）
    const count = await page.locator('.kkd-gallery-thumb-btn').count();
    expect(count).toBeGreaterThan(1);
  });

  test('點右側縮圖後，左側大圖換成該張，且該縮圖標記為選中', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(DETAIL_PATH);

    const main = page.locator('.kkd-gallery-main');
    await expect(main).toBeVisible({ timeout: 10_000 });

    const buttons = page.locator('.kkd-gallery-thumb-btn');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(1);

    // 比較時去掉 host（大圖與縮圖的 src 可能一為絕對、一為相對），只比 path+query。
    const norm = (s: string | null) => (s ? s.replace(/^https?:\/\/[^/]+/, '') : s);

    const beforeSrc = norm(await main.getAttribute('src'));

    // 找一個縮圖，其圖片來源與目前大圖不同（fixture 有重複 URL，需挑不同的那張）
    let targetIndex = -1;
    for (let i = 0; i < count; i++) {
      const s = norm(await buttons.nth(i).locator('img').getAttribute('src'));
      if (s && s !== beforeSrc) { targetIndex = i; break; }
    }
    expect(targetIndex).toBeGreaterThan(-1);

    const targetSrc = norm(await buttons.nth(targetIndex).locator('img').getAttribute('src'));
    await buttons.nth(targetIndex).click();

    // 大圖換成被點的那張
    await expect.poll(async () => norm(await main.getAttribute('src'))).toBe(targetSrc);

    // 被點的縮圖標記為選中（active / aria-selected）
    await expect(buttons.nth(targetIndex)).toHaveClass(/active/);
    await expect(buttons.nth(targetIndex)).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('手機版活動照片仍為左右滑動輪播（不受影響）', () => {
  test('手機版顯示可滑動輪播 track', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(DETAIL_PATH);

    const track = page.locator('.kkd-carousel-track');
    await expect(track).toBeVisible({ timeout: 10_000 });
    const overflowX = await track.evaluate((el) => getComputedStyle(el).overflowX);
    expect(['auto', 'scroll']).toContain(overflowX);
    // 桌機大圖/縮圖列在手機隱藏
    await expect(page.locator('.kkd-gallery-desktop')).toBeHidden();
  });
});
