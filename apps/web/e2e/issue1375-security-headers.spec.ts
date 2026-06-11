import { test, expect } from './helpers';

/**
 * Issue #1375 — HSTS + CSP Report-Only headers 真實瀏覽器驗證。
 *
 * 斷言 next.config.mjs securityHeaders 實際出現在頁面/API 回應上，
 * CSP 僅以 Report-Only 試行（不得出現 enforce 的 Content-Security-Policy），
 * 且首頁載入過程 console 沒有任何「被 CSP 阻擋」（Refused to …）的錯誤 —
 * Report-Only 違規訊息會帶 [Report Only] 標記，不在此列。
 */

const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

test.describe('issue1375 security headers', () => {
  test('首頁回應含 HSTS 與 CSP-Report-Only，未 enforce，console 無 CSP 阻擋', async ({ page }) => {
    const blocked: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Refused to') && !text.includes('Report Only')) {
        blocked.push(text);
      }
    });

    const response = await page.goto('/');
    expect(response).not.toBeNull();
    const headers = response!.headers();

    expect(headers['strict-transport-security']).toBe(HSTS_VALUE);

    const csp = headers['content-security-policy-report-only'];
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('https://payment.ecpay.com.tw');
    expect(csp).toContain('https://payment-stage.ecpay.com.tw');
    expect(csp).toContain('https://*.supabase.co');

    // 不得直接 enforce（避免擋掉金流跳轉）
    expect(headers['content-security-policy']).toBeUndefined();

    await page.waitForLoadState('networkidle');
    expect(blocked, `console 出現 CSP 阻擋訊息: ${blocked.join('\n')}`).toEqual([]);
  });

  test('活動列表頁同樣帶 HSTS 且無 CSP 阻擋', async ({ page }) => {
    const blocked: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Refused to') && !text.includes('Report Only')) {
        blocked.push(text);
      }
    });

    const response = await page.goto('/activities');
    expect(response).not.toBeNull();
    expect(response!.headers()['strict-transport-security']).toBe(HSTS_VALUE);

    await page.waitForLoadState('networkidle');
    expect(blocked, `console 出現 CSP 阻擋訊息: ${blocked.join('\n')}`).toEqual([]);
  });

  test('API 回應同樣帶 HSTS', async ({ request }) => {
    const res = await request.get('/api/admin/auth/csrf');
    expect(res.headers()['strict-transport-security']).toBe(HSTS_VALUE);
  });
});
