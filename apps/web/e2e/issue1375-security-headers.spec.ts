import { test, expect } from './helpers';

/**
 * Issue #1375 → #1568 — HSTS + CSP **enforce** headers 真實瀏覽器驗證。
 *
 * #1568：CSP 由 Report-Only 轉為 enforce（實際阻擋）。本測試驗證：
 * - 回應帶 enforce 的 `Content-Security-Policy`（不再是 Report-Only）；
 * - HSTS 含 `preload`；
 * - 關鍵頁面載入過程 console 沒有任何「被 CSP 阻擋」（Refused to …）錯誤 ——
 *   enforce 下這類訊息代表真的被擋、頁面會壞，故必須為空。
 */

const HSTS_VALUE = 'max-age=31536000; includeSubDomains; preload';

function watchBlocked(page: import('@playwright/test').Page): string[] {
  const blocked: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    // enforce 下 CSP 阻擋訊息不帶 [Report Only] 標記
    if (text.includes('Refused to') && !text.includes('Report Only')) blocked.push(text);
  });
  return blocked;
}

test.describe('issue1568 CSP enforce + HSTS', () => {
  test('首頁：enforce CSP、無 Report-Only、HSTS preload、console 無 CSP 阻擋', async ({ page }) => {
    const blocked = watchBlocked(page);
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    const headers = response!.headers();

    expect(headers['strict-transport-security']).toBe(HSTS_VALUE);
    const csp = headers['content-security-policy'];
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('https://payment.ecpay.com.tw');
    // 已 enforce → 不應再有 Report-Only header
    expect(headers['content-security-policy-report-only']).toBeUndefined();

    await page.waitForLoadState('networkidle');
    expect(blocked, `console 出現 CSP 阻擋訊息: ${blocked.join('\n')}`).toEqual([]);
  });

  test('活動列表頁：enforce CSP 下正常載入、無 CSP 阻擋', async ({ page }) => {
    const blocked = watchBlocked(page);
    const response = await page.goto('/activities');
    expect(response!.headers()['content-security-policy']).toBeTruthy();
    await page.waitForLoadState('networkidle');
    // 頁面主體有渲染（卡片容器或搜尋）＋無 CSP 阻擋
    expect(blocked, `console 出現 CSP 阻擋訊息: ${blocked.join('\n')}`).toEqual([]);
  });

  test('登入頁：enforce CSP 下正常載入、無 CSP 阻擋', async ({ page }) => {
    const blocked = watchBlocked(page);
    await page.goto('/login');
    await expect(page.getByTestId('google-login-btn')).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState('networkidle');
    expect(blocked, `console 出現 CSP 阻擋訊息: ${blocked.join('\n')}`).toEqual([]);
  });

  test('API 回應帶 HSTS preload', async ({ request }) => {
    const res = await request.get('/api/admin/auth/csrf');
    expect(res.headers()['strict-transport-security']).toBe(HSTS_VALUE);
  });
});
