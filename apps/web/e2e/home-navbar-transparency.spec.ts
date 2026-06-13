import { test, expect } from './helpers';

/**
 * 首頁導覽列透明度 — 驗證「載入即透明、捲過 hero 才加深色底、重新整理一律透明」。
 *
 * 根因：瀏覽器預設會還原捲動位置（在頁面下方重新整理會自動捲回原處），還原時觸發的
 * scroll 事件會讓導覽列在載入瞬間就被判定為「已捲動」而套上深色底。修法是首頁把
 * history.scrollRestoration 設為 'manual'（root layout inline script 於 hydration 前先設、
 * Navbar effect 再設並 scrollTo(0,0) 雙重保險），重新整理一律從頂端開始。
 * 故本 spec 特別涵蓋「捲到下方後連續多次重新整理仍透明」。
 */

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

async function navBg(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const h = document.querySelector('header.tp-navbar');
    return h ? getComputedStyle(h).backgroundColor : '(no header)';
  });
}

test('載入時導覽列透明，捲過 hero 後加半透明深色底', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('header.tp-navbar.tp-navbar--transparent');
  expect(await navBg(page)).toBe(TRANSPARENT);

  // 捲過整個 hero 後應加半透明深色底。注意：掛載 effect 會執行一次 scrollTo(0,0)，
  // 若在 hydration 完成前就捲動會被它重置，故用 toPass 重試直到 effect 跑完後生效。
  await expect(async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('header.tp-navbar')).toHaveClass(/tp-navbar--scrolled/, { timeout: 1000 });
  }).toPass();
  await expect.poll(() => navBg(page)).not.toBe(TRANSPARENT);
});

test('在頁面下方重新整理，導覽列仍從透明開始（連續三次）', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('header.tp-navbar');

  for (let i = 1; i <= 3; i++) {
    // 先捲到下方使導覽列變深色，再重新整理
    await page.evaluate(() => window.scrollTo(0, 1300 + Math.random() * 400));
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForSelector('header.tp-navbar.tp-navbar--transparent');
    await page.waitForTimeout(400);
    const y = await page.evaluate(() => window.scrollY);
    expect(y, `reload #${i}: 應回到頂端`).toBe(0);
    expect(await navBg(page), `reload #${i}: 導覽列應透明`).toBe(TRANSPARENT);
    await expect(page.locator('header.tp-navbar')).not.toHaveClass(/tp-navbar--scrolled/);
  }
});
