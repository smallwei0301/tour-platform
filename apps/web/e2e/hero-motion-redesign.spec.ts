/**
 * Hero motion 改版（branch: claude/hero-section-redesign）
 *
 * 首頁 hero 由靜態大圖改為 boomerang 影片背景（BoomerangVideoBg）。
 * 此 spec 鎖：
 *   1. hero 區塊與影片背景容器正常渲染（即使影片 CDN 不可用也不能壞版）。
 *   2. 品牌文案（標題／副標／品牌區塊）存在。
 *   3. funnel 依賴的 home-cta-explore / home-cta-guides 保留且可見。
 */
import { test, expect } from './helpers';

test.beforeEach(async ({ page }) => {
  // 不依賴外部 CDN：擋掉 hero 影片請求，hero 仍須正常渲染（fallback 底色）
  await page.route('**/*.mp4', (route) => route.abort());
});

test('首頁 motion hero 渲染標題與影片背景', async ({ page }) => {
  await page.goto('/');
  const hero = page.getByTestId('hero-motion');
  await expect(hero).toBeVisible();
  await expect(hero.locator('h1')).toContainText('找到懂路的人');
  await expect(hero.locator('h1')).toContainText('帶你走進台灣最有故事的地方');
  await expect(hero).toContainText('不跟團、不趕路');
  await expect(hero).toContainText('島嶼裡，還有一座島');

  // 影片背景：video 元素存在且為 muted + playsinline（自動播放前提）
  const video = page.getByTestId('hero-motion-bg').locator('video');
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute('playsinline', '');
  expect(await video.evaluate((el) => (el as HTMLVideoElement).muted)).toBe(true);
});

test('hero CTA 保留 funnel 依賴的 testid 並指向正確路徑', async ({ page }) => {
  await page.goto('/');
  const explore = page.getByTestId('home-cta-explore');
  await expect(explore).toBeVisible();
  await expect(explore).toHaveAttribute('href', '/activities');

  const guides = page.getByTestId('home-cta-guides');
  await expect(guides).toBeVisible();
  await expect(guides).toHaveAttribute('href', '/guides');
});

test('行動版（375px）hero 不壞版且 CTA 可見', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto('/');
  await expect(page.getByTestId('hero-motion')).toBeVisible();
  await expect(page.getByTestId('home-cta-explore')).toBeVisible();
  // 桌機限定的「往下探索」提示在行動版隱藏
  await expect(page.locator('.tp-hero-motion-scrollhint')).toBeHidden();
});
