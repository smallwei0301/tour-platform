import { test, expect, setGuideSession } from './helpers';
import type { Route } from '@playwright/test';

const guideId = '99999999-9999-4999-8999-999999999999';
const unsafeOrder = {
  id: 'order-1761-safe',
  scheduleId: 'schedule-1761-private',
  guestName: '旅人甲',
  guestPhone: '0912-000-000',
  maskedEmail: 'traveler@example.invalid',
  planId: 'plan-1761-private',
  hasConflictOverride: true,
  tourTitle: '山徑晨光小旅行',
  scheduleDate: '2026-09-15T01:00:00.000Z',
  partySize: 2,
  status: 'confirmed',
  paymentStatus: 'paid',
  totalTwd: 3600,
  createdAt: '2026-08-31T01:00:00.000Z',
};

async function prepareMidao2Shell(page: Parameters<typeof setGuideSession>[0]) {
  await setGuideSession(page, guideId);
  await page.route('**/api/guide/auth/csrf', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/v2/guide/midao/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { guideName: 'Midao E2E Guide', counts: { newRequests: 0, pendingReply: 0 }, topRequest: null, recentRequests: [] },
      }),
    });
  });
}

test.describe('Midao2 read-only orders workbench', () => {
  test('desktop native navigation renders only the safe booking projection', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const methods: string[] = [];
    await prepareMidao2Shell(page);
    await page.route('**/api/v2/guide/bookings', async (route) => {
      methods.push(route.request().method());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [unsafeOrder] }) });
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/midao2', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const ordersTab = page.getByTestId('midao2-tab-訂單');
    await expect(ordersTab).toBeVisible({ timeout: 120_000 });
    await Promise.all([
      page.waitForURL(/\/midao2\/orders\/?$/u, { waitUntil: 'commit', timeout: 120_000 }),
      ordersTab.click(),
    ]);
    await expect(page.getByRole('heading', { name: '訂單', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => methods.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('midao2-orders-list')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('山徑晨光小旅行')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('旅人甲');
    expect(body).not.toContain('0912-000-000');
    expect(body).not.toContain('traveler@example.invalid');
    expect(methods.every((method) => method === 'GET')).toBe(true);

    const screenshotPath = testInfo.outputPath('midao2-orders-desktop.png');
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach('midao2-orders-desktop', { path: screenshotPath, contentType: 'image/png' });
  });

  test('390px read failure retries with GET only and reaches the empty state', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    let attempts = 0;
    const methods: string[] = [];
    await prepareMidao2Shell(page);
    await page.route('**/api/v2/guide/bookings', async (route) => {
      attempts += 1;
      methods.push(route.request().method());
      await route.fulfill(
        attempts === 1
          ? { status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'private server detail' } }) }
          : { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) },
      );
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/midao2/orders', { waitUntil: 'domcontentloaded' });
    const ordersRegion = page.getByRole('region', { name: '訂單', exact: true });
    await expect.poll(() => attempts, { timeout: 30_000 }).toBe(1);
    await expect(ordersRegion.getByRole('alert')).toContainText('目前無法載入訂單', { timeout: 30_000 });
    await expect(ordersRegion.getByText('private server detail')).toHaveCount(0);
    await ordersRegion.getByRole('button', { name: '重試', exact: true }).click();
    await expect(ordersRegion.getByTestId('midao2-orders-empty')).toBeVisible({ timeout: 30_000 });
    expect(methods).toEqual(['GET', 'GET']);

    const screenshotPath = testInfo.outputPath('midao2-orders-mobile-empty.png');
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach('midao2-orders-mobile-empty', { path: screenshotPath, contentType: 'image/png' });
  });

  test('concurrent summary and canonical-read 401 responses preserve the exact guide login return path', async ({ page }) => {
    test.setTimeout(180_000);
    const methods: string[] = [];
    const arrivals = new Set<string>();
    const navigationPaths: string[] = [];
    let releaseBarrier = () => {};
    const both401Arrived = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });

    await setGuideSession(page, guideId);
    await page.route('**/api/guide/auth/csrf', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    const respondAfterBoth401Arrive = async (route: Route) => {
      methods.push(route.request().method());
      arrivals.add(route.request().url());
      await both401Arrived;
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    };
    await page.route('**/api/v2/guide/midao/summary', respondAfterBoth401Arrive);
    await page.route('**/api/v2/guide/bookings', async (route) => {
      await respondAfterBoth401Arrive(route);
    });

    await page.goto('/midao2/orders', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect.poll(() => arrivals.size, { timeout: 30_000 }).toBe(2);
    expect(methods).toEqual(['GET', 'GET']);
    expect(new URL(page.url()).pathname).toBe('/midao2/orders');
    page.on('request', (request) => {
      if (request.isNavigationRequest()) {
        const url = new URL(request.url());
        navigationPaths.push(`${url.pathname}${url.search}`);
      }
    });
    releaseBarrier();
    await expect.poll(() => navigationPaths, { timeout: 30_000 }).toContain('/guide/login?next=/midao2/orders');
    expect(navigationPaths).not.toContain('/guide/login?next=/midao2');
  });
});
