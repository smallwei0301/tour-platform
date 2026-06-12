import { test, expect } from './helpers';

/**
 * 首頁 hero 曙光動態 — 驗證動畫「確實生效」而非只存在於 CSS。
 *
 * 歷史教訓：
 * - v1 用 mix-blend-mode: screen 疊在合成層上 → iOS Safari 失效。
 * - v2 用 CSS @keyframes＋prefers-reduced-motion 停用 → Android Chrome
 *   在省電模式/系統「移除動畫」時強制 reduced-motion，使用者看到靜態。
 * - v3（現行）：LpHeroMotion 以 WAAPI（element.animate）驅動五層
 *   （推近/暮色罩/光束/雲層×2），不受 reduced-motion 設定影響。
 *
 * 本 spec 鎖三件事：五層動畫 running、雲層 transform 真的隨時間位移、
 * reduced-motion 模擬下動畫照樣運作。
 */

// lp-hero-fg＝去背洞穴前景（推進拉遠）；遠景山谷 lp-hero-photo 靜止
const LAYER_CLASSES = ['lp-hero-fg', 'lp-hero-dawn', 'lp-hero-rays', 'lp-hero-clouds', 'lp-hero-clouds2'];

async function runningTargets(page: import('@playwright/test').Page): Promise<string[]> {
  // fg 推近為單程＋fill forwards：6.15s 後 playState 變 finished（仍保持定格）→ 一併接受
  return page.evaluate(() =>
    document.getAnimations()
      .filter((a) => a.playState === 'running' || a.playState === 'finished')
      .map((a) => ((a.effect as KeyframeEffect | null)?.target as Element | null)?.className ?? ''),
  );
}

test('hero 五層動畫 running，雲層持續飄動、暮色罩亮暗變化', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.lp-hero-clouds')).toBeAttached();

  // 動畫引擎層：五層 WAAPI 動畫必須 running（poll：等 client component mount）
  await expect
    .poll(() => runningTargets(page), { timeout: 10_000 })
    .toEqual(expect.arrayContaining(LAYER_CLASSES));

  // 雲飄動：雲層 transform 兩個取樣點必須位移
  const c1 = await page.$eval('.lp-hero-clouds', (el) => getComputedStyle(el).transform);
  const d1 = await page.$eval('.lp-hero-dawn', (el) => getComputedStyle(el).opacity);
  await page.waitForTimeout(1500);
  const c2 = await page.$eval('.lp-hero-clouds', (el) => getComputedStyle(el).transform);
  const d2 = await page.$eval('.lp-hero-dawn', (el) => getComputedStyle(el).opacity);
  expect(c1).not.toBe(c2);
  expect(d1).not.toBe(d2);

  // 第一視角推進契約：去背洞穴前景在縮放、遠景山谷必須靜止
  const fg = await page.$eval('.lp-hero-fg', (el) => getComputedStyle(el).transform);
  const bg = await page.$eval('.lp-hero-photo', (el) => getComputedStyle(el).transform);
  expect(fg).not.toBe('none');
  expect(bg).toBe('none');
});

test('reduced-motion（Android 省電/移除動畫情境）下動畫照樣運作', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.lp-hero-clouds')).toBeAttached();

  await expect
    .poll(() => runningTargets(page), { timeout: 10_000 })
    .toEqual(expect.arrayContaining(LAYER_CLASSES));

  const c1 = await page.$eval('.lp-hero-clouds', (el) => getComputedStyle(el).transform);
  await page.waitForTimeout(1500);
  const c2 = await page.$eval('.lp-hero-clouds', (el) => getComputedStyle(el).transform);
  expect(c1).not.toBe(c2);
  await context.close();
});
