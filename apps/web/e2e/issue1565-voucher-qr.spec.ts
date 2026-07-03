import { test, expect, setTravelerSession } from './helpers';

// Issue #1565（健檢 v2 P0-1）— 旅客訂單頁電子憑證 QR＋短碼（confirmed 訂單）。
// traveler auth 用 setTravelerSession（假 session cookie + 攔 auth/v1/user）。

const ORDER_ID = 'ord_qr_1565';

function mockOrderDetail(page: import('@playwright/test').Page, status: string, withVoucher: boolean) {
  return page.route(`**/api/me/orders/${ORDER_ID}**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const data: Record<string, unknown> = {
      id: ORDER_ID, status, totalTwd: 4000, title: '柴山探洞體驗', peopleCount: 2,
      contactName: '王小明', contactEmail: 'qr1565@example.com',
      scheduleStartAt: '2026-08-01T01:00:00Z',
    };
    if (withVoucher) {
      data.voucherToken = 'v1.ord_qr_1565.deadbeefcafe';
      data.voucherShortCode = 'MID-7K9Q2X';
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });
}

test.describe('Issue #1565 — 旅客電子憑證 QR', () => {
  test.beforeEach(async ({ page }) => {
    await setTravelerSession(page);
    await page.route('**/api/me/orders/*/messages**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) }));
  });

  test('T1565.1 — confirmed 訂單顯示 QR＋短碼＋出示說明', async ({ page }) => {
    await mockOrderDetail(page, 'confirmed', true);
    await page.goto(`/me/orders/${ORDER_ID}`);
    await expect(page.getByTestId('voucher-card')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('voucher-qr')).toBeVisible();
    await expect(page.getByTestId('voucher-shortcode')).toHaveText('MID-7K9Q2X');
    await expect(page.getByTestId('voucher-card')).toContainText('向導遊出示');
  });

  test('T1565.2 — 非 confirmed（paid）訂單不顯示憑證', async ({ page }) => {
    await mockOrderDetail(page, 'paid', false);
    await page.goto(`/me/orders/${ORDER_ID}`);
    // 等頁面主體出現後斷言憑證卡不存在
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('voucher-card')).toHaveCount(0);
  });
});
