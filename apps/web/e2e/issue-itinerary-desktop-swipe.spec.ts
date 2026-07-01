import { test, expect } from '@playwright/test';

/**
 * 電腦版套用手機版「左右滑動」樣式：
 *  (1) 上方活動照片相簿 — 電腦版改用手機的左右滑動輪播（scroll-snap track + 圓點），
 *      可滑覽全部照片；不再是只顯示前 4 張的 3:1 grid。
 *  (2) 旅客評價卡片 — 電腦版與手機一致，一次一張大卡（約容器 86% 寬）並露出下一張。
 *
 * 詳情頁為 server render；dev 走 in-memory fixture（kaohsiung-chaishan-cave-experience，
 * galleryUrls 有多張照片），故不需 page.route mock。
 */

const DETAIL_PATH = '/activities/kaohsiung/kaohsiung-chaishan-cave-experience';
const DESKTOP = { width: 1280, height: 900 };

test.describe('電腦版活動照片改為左右滑動輪播', () => {
  test('電腦版顯示滑動輪播（track 可見），不再退回 3:1 grid', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(DETAIL_PATH);

    const track = page.locator('.kkd-carousel-track');
    await expect(track).toBeVisible({ timeout: 10_000 });
    const display = await track.evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('flex');

    // 舊的桌機 grid 已移除
    await expect(page.locator('.kkd-gallery-desktop')).toHaveCount(0);
  });

  test('全部照片都在輪播中（每張一個 slide），且電腦版可橫向捲動滑到更多照片', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(DETAIL_PATH);

    const track = page.locator('.kkd-carousel-track');
    await expect(track).toBeVisible({ timeout: 10_000 });

    const slides = track.locator('.kkd-carousel-slide');
    const count = await slides.count();
    // fixture 至少有數張照片；每張都是一個 slide（全部可滑覽，非只前 4 張）
    expect(count).toBeGreaterThan(1);

    // 內容寬度超過可視寬度 → 電腦版可左右捲動
    const { scrollWidth, clientWidth } = await track.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    // 程式化捲到最尾端會移動位置（可滑到最後一張）
    const before = await track.evaluate((el) => el.scrollLeft);
    await track.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    const after = await track.evaluate((el) => el.scrollLeft);
    expect(after).toBeGreaterThan(before);
  });

  test('圓點指示（dots）在電腦版可見', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(DETAIL_PATH);
    const dots = page.locator('.kkd-carousel-dots');
    await expect(dots).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('電腦版旅客評價卡片套用手機版一次一張樣式', () => {
  test('電腦版單張評價卡約佔卷軸容器 86%（一次一張大卡＋露出下一張），非多張窄卡', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(DETAIL_PATH);

    const list = page.locator('#section-reviews .kkd-review-list');
    await expect(list).toBeVisible({ timeout: 10_000 });

    const card = list.locator('.kkd-review-card').first();
    const listBox = await list.boundingBox();
    const cardBox = await card.boundingBox();
    expect(listBox && cardBox).toBeTruthy();

    // 單張卡寬應遠大於容器一半（≈86%），代表電腦版一次只完整顯示一張，而非擠多張窄卡
    const ratio = (cardBox!.width) / (listBox!.width);
    expect(ratio).toBeGreaterThan(0.7);

    // 仍可左右滑動（內容溢出）
    const { scrollWidth, clientWidth } = await list.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });
});
