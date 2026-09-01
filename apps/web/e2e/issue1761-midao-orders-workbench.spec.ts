import { createHmac } from 'node:crypto';
import { test, expect, loginMidaoGuideViaApi } from './helpers';

const guide = {
  guideId: '99999999-9999-4999-8999-999999999999',
  guideName: 'Midao E2E Guide',
  email: 'midao-e2e@example.invalid',
  password: 'midao-e2e-only-password',
  expectedRedirect: '/midao' as const,
};

const safeOrder = {
  id: 'order-1761-safe',
  scheduleId: 'schedule-1761-safe',
  guestName: '旅人甲',
  guestPhone: '0912-000-000',
  maskedEmail: 'traveler@example.invalid',
  scheduleDate: '2026-09-15T01:00:00.000Z',
  planId: 'plan-1761-safe',
  tourTitle: '山徑晨光小旅行',
  partySize: 2,
  status: 'confirmed',
  paymentStatus: 'paid',
  totalTwd: 3600,
  createdAt: '2026-08-31T01:00:00.000Z',
  hasConflictOverride: false,
};

async function login(page: Parameters<typeof loginMidaoGuideViaApi>[0]) {
  if (process.env.MIDAO_E2E_LOCAL === '1') {
    const secret = process.env.GUIDE_SESSION_SECRET;
    if (!secret) throw new Error('MIDAO_E2E_LOCAL requires GUIDE_SESSION_SECRET');
    const signature = createHmac('sha256', secret).update(`${guide.guideId}:1`, 'utf8').digest('hex');
    const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3333';
    await page.context().addCookies([
      { name: 'guide_token', value: `${guide.guideId}:1:${signature}`, url: baseURL },
      { name: 'guide_id', value: guide.guideId, url: baseURL },
    ]);
    return;
  }
  await loginMidaoGuideViaApi(page, guide);
}

test.describe('Midao read-only orders workbench', () => {
  test('the native nav opens a guide-owned canonical booking list without unsafe fields or mutation', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const methods: string[] = [];
    await page.route('**/api/v2/guide/bookings', async (route) => {
      methods.push(route.request().method());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [safeOrder] }),
      });
    });

    await login(page);
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });
    const desktopNavigation = page.locator('.midao-desktop-sidebar');
    await desktopNavigation.getByRole('link', { name: '訂單', exact: true }).click();
    await expect(page).toHaveURL(/\/midao\/orders\/?$/u, { timeout: 120_000 });
    await expect(page.getByRole('heading', { name: '訂單' })).toBeVisible();
    await expect.poll(() => methods.length, { timeout: 30_000 }).toBe(1);
    await expect(page.getByTestId('midao-orders-list')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('山徑晨光小旅行')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('旅人甲');
    expect(body).not.toContain('0912-000-000');
    expect(body).not.toContain('traveler@example.invalid');
    expect(methods).toEqual(['GET']);

    const screenshotPath = testInfo.outputPath('midao-orders-populated.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('midao-orders-populated', { path: screenshotPath, contentType: 'image/png' });
  });

  test('a canonical read failure remains visible and retry issues only another GET', async ({ page }) => {
    test.setTimeout(180_000);
    let attempts = 0;
    const methods: string[] = [];
    await page.route('**/api/v2/guide/bookings', async (route) => {
      attempts += 1;
      methods.push(route.request().method());
      if (attempts === 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: { code: 'CONFLICT', message: 'private server detail' } }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
    });

    await login(page);
    await page.goto('/midao/orders', { waitUntil: 'domcontentloaded' });
    const ordersRegion = page.getByRole('region', { name: '訂單', exact: true });
    await expect.poll(() => attempts, { timeout: 30_000 }).toBe(1);
    await expect(ordersRegion.getByRole('alert')).toContainText('目前無法載入訂單', { timeout: 30_000 });
    await expect(ordersRegion.getByText('private server detail')).toHaveCount(0);
    await expect(ordersRegion.getByTestId('midao-orders-empty')).toHaveCount(0);

    await ordersRegion.getByRole('button', { name: '再試一次', exact: true }).click();
    await expect(ordersRegion.getByTestId('midao-orders-empty')).toBeVisible({ timeout: 30_000 });
    expect(attempts).toBe(2);
    expect(methods).toEqual(['GET', 'GET']);
  });
});
