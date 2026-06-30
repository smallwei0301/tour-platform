import { test, expect } from './helpers';

/**
 * GA4（gtag.js）真實瀏覽器注入驗證。
 *
 * 不依賴真正連到 Google：攔截 googletagmanager.com 的 gtag.js 回一個 no-op stub，
 * 確認頁面 (1) 注入了帶正確 GA ID 的 gtag.js <script>、(2) window.dataLayer /
 * window.gtag 已被初始化（gtag('js') / gtag('config') 有推進 dataLayer）。
 * 這樣即可在離線 / 無外網的 CI 下穩定驗證橋接，不打到外部服務。
 */
const GA_ID = 'G-26EYTQJ9RC';

// 容器內預裝的 Chromium 與 pinned @playwright/test 版本不一定對得上下載路徑，
// 允許用 PW_CHROMIUM_PATH 覆寫 executablePath（CI / 一般環境不設則走預設）。
const chromiumPath = process.env.PW_CHROMIUM_PATH;
if (chromiumPath) {
  test.use({ launchOptions: { executablePath: chromiumPath } });
}

test.describe('GA4 gtag.js 整合', () => {
  test('首頁注入帶正確 GA ID 的 gtag.js，且 dataLayer 已初始化', async ({ page }) => {
    // 攔下對 Google 的真實請求，回一個 no-op，避免外部依賴。
    await page.route('https://www.googletagmanager.com/gtag/js**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: '/* stubbed gtag.js */',
      })
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // (1) 注入了正確的 gtag.js script，且全站僅一份。
    const gtagScripts = page.locator(
      `script[src*="googletagmanager.com/gtag/js"][src*="id=${GA_ID}"]`
    );
    await expect(gtagScripts).toHaveCount(1);

    // (2) inline init 已執行：dataLayer 帶 js + config 兩筆。
    const state = await page.evaluate(() => {
      const w = window as unknown as {
        dataLayer?: unknown[];
        gtag?: unknown;
      };
      return {
        hasGtag: typeof w.gtag === 'function',
        dataLayer: (w.dataLayer ?? []).map((entry) =>
          Array.isArray(entry) ? entry.map((v) => (v instanceof Date ? 'Date' : v)) : entry
        ),
      };
    });

    expect(state.hasGtag).toBe(true);
    const dl = state.dataLayer as unknown[][];
    expect(dl.some((args) => args[0] === 'js')).toBe(true);
    expect(dl.some((args) => args[0] === 'config' && args[1] === GA_ID)).toBe(true);
  });
});
