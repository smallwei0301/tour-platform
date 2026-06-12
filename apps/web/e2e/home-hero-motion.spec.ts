import { test, expect } from './helpers';

/**
 * 首頁 hero 曙光動態 — 驗證動畫「確實生效」而非只存在於 CSS。
 *
 * 背景：第一版用 mix-blend-mode: screen 疊在持續 transform 的合成層上，
 * iOS Safari 跨合成層混色會失效、且 screen 疊在亮部幾乎不可見 —— CSS 存在
 * 但使用者看不到效果。重新設計改用純 alpha 圖層（暮色罩亮暗循環＋洞口
 * 放射光束＋Ken Burns），本 spec 從動畫引擎層驗證三層動畫真的在跑、
 * 暮色罩透明度真的隨時間變化。
 */

test('hero 曙光三層動畫 running，暮色罩透明度隨時間變化', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.lp-hero-dawn')).toBeAttached();

  // 動畫引擎層：三個 CSS animation 必須存在且為 running
  //（poll：首次載入/重編譯時動畫可能短暫處於 pending）
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.getAnimations()
            .filter((a) => a.playState === 'running')
            .map((a) => (a as CSSAnimation).animationName),
        ),
      { timeout: 10_000 },
    )
    .toEqual(expect.arrayContaining(['lpHeroZoom', 'lpHeroDawn', 'lpHeroRays']));

  // 視覺層：暮色罩 computed opacity 兩個取樣點必須不同（動畫真的在動）
  const o1 = await page.$eval('.lp-hero-dawn', (el) => getComputedStyle(el).opacity);
  await page.waitForTimeout(1500);
  const o2 = await page.$eval('.lp-hero-dawn', (el) => getComputedStyle(el).opacity);
  expect(o1).not.toBe(o2);
});

test('prefers-reduced-motion: reduce 時動畫全部停用', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.lp-hero-dawn')).toBeAttached();
  const running = await page.evaluate(() => document.getAnimations().length);
  expect(running).toBe(0);
  await context.close();
});
