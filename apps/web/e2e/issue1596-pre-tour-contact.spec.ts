import { test, expect, setTravelerSession } from './helpers';

// Issue #1596 — 行前 24h 導遊聯絡卡：僅 API 回非 null 時顯示（資格＋同意雙閘在後端）。

const ORDER_ID = 'ord_pretour_1596';

function mockOrder(page: import('@playwright/test').Page, status: string) {
  return page.route(`**/api/v2/orders/${ORDER_ID}**`, async (route) => {
    const url = route.request().url();
    if (url.includes('/guide-contact') || url.includes('/messages')) return route.fallback();
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: {
        id: ORDER_ID, status, totalTwd: 4000, title: '柴山探洞體驗', peopleCount: 2,
        contactName: '王小明', contactEmail: 'pre1596@example.com',
        scheduleStartAt: '2026-08-01T01:00:00Z',
      } }),
    });
  });
}

test.describe('Issue #1596 — 行前導遊聯絡卡', () => {
  test.beforeEach(async ({ page }) => {
    await setTravelerSession(page);
    await page.route('**/api/v2/orders/*/messages**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) }));
  });

  test('T1596.E1 — API 回 guideContact → 顯示卡片＋tel 連結', async ({ page }) => {
    await mockOrder(page, 'confirmed');
    await page.route(`**/api/v2/orders/${ORDER_ID}/guide-contact**`, (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { guideContact: { name: '陳嚮導', phone: '0912345678' } } }),
    }));
    await page.goto(`/me/orders/${ORDER_ID}`);
    await expect(page.getByTestId('pre-tour-contact-card')).toBeVisible({ timeout: 10_000 });
    const phone = page.getByTestId('pre-tour-contact-phone');
    await expect(phone).toHaveText('0912345678');
    await expect(phone).toHaveAttribute('href', 'tel:0912345678');
  });

  test('T1596.E2 — API 回 guideContact=null（資格外/未同意）→ 不顯示卡片', async ({ page }) => {
    await mockOrder(page, 'confirmed');
    await page.route(`**/api/v2/orders/${ORDER_ID}/guide-contact**`, (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { guideContact: null } }),
    }));
    await page.goto(`/me/orders/${ORDER_ID}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('pre-tour-contact-card')).toHaveCount(0);
  });
});
