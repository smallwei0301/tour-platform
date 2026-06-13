import { test, expect } from './helpers';

/**
 * 首頁導覽列透明度 — 驗證「載入即透明、捲過 hero 才加深色底、重新整理一律透明」。
 *
 * 根因（#1429）：透明狀態原本由 className `tp-navbar--transparent`（依 client
 * usePathname()==='/' 判定）驅動。但首頁是 ISR（revalidate 60s），production 於
 * 重新整理觸發 revalidation 時 server 端 usePathname 可能回 null → isHome=false →
 * 導覽列被「快取成實心底」並送給所有使用者（無痕、超過 60 秒、多次刷新仍實心）。
 * 修法：透明狀態改由純 CSS `body:has(.lp-root) .tp-navbar` 驅動，不依賴 JS／
 * usePathname；另保留 client 偵測 .lp-hero 後加的 .tp-navbar--home 作為 :has() 後備。
 */

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

async function navState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const h = document.querySelector('header.tp-navbar') as HTMLElement;
    const cs = getComputedStyle(h);
    return { bg: cs.backgroundColor, pos: cs.position, cls: h.className };
  });
}
// CSS 已套用（position:fixed 代表透明樣式生效，避免量到未載入樣式的假透明）
async function waitStyled(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const h = document.querySelector('header.tp-navbar');
    return h && getComputedStyle(h).position === 'fixed';
  });
}

test('載入時導覽列透明，捲過 hero 後加半透明深色底', async ({ page }) => {
  await page.goto('/');
  await waitStyled(page);
  expect((await navState(page)).bg).toBe(TRANSPARENT);

  await expect(async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('header.tp-navbar')).toHaveClass(/tp-navbar--scrolled/, { timeout: 1000 });
  }).toPass();
  await expect.poll(async () => (await navState(page)).bg).not.toBe(TRANSPARENT);
});

test('根因回歸：移除 JS class（模擬 production ISR isHome=false）導覽列仍透明', async ({ page }) => {
  await page.goto('/');
  await waitStyled(page);
  // 模擬 production ISR 快取出的 server HTML：導覽列只有 base class，沒有 --home/--scrolled。
  await page.evaluate(() => {
    const h = document.querySelector('header.tp-navbar') as HTMLElement;
    h.className = 'tp-navbar';
  });
  const s = await navState(page);
  expect(s.cls).toBe('tp-navbar');
  // body:has(.lp-root) 純 CSS 仍讓它透明＋fixed（不依賴 className）
  expect(s.bg).toBe(TRANSPARENT);
  expect(s.pos).toBe('fixed');
});

test('在頁面下方重新整理，導覽列仍從透明開始（連續三次）', async ({ page }) => {
  await page.goto('/');
  await waitStyled(page);

  for (let i = 1; i <= 3; i++) {
    await page.evaluate(() => window.scrollTo(0, 1300 + Math.random() * 400));
    await page.waitForTimeout(200);
    await page.reload();
    await waitStyled(page);
    await page.waitForTimeout(400);
    const y = await page.evaluate(() => window.scrollY);
    expect(y, `reload #${i}: 應回到頂端`).toBe(0);
    expect((await navState(page)).bg, `reload #${i}: 導覽列應透明`).toBe(TRANSPARENT);
  }
});
