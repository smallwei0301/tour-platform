import { test, expect, loginMidaoGuideViaApi } from './helpers';

const guide = {
  guideId: '99999999-9999-4999-8999-999999999999',
  guideName: 'Midao E2E Guide',
  email: 'midao-e2e@example.invalid',
  password: 'midao-e2e-only-password',
  expectedRedirect: '/midao' as const,
};

const requestRefs = [
  'booking_11111111-1111-4111-8111-111111111111',
  'booking_11111111-1111-4111-8111-111111111112',
  'booking_11111111-1111-4111-8111-111111111113',
] as const;

const homeData = {
  profile: { displayName: guide.guideName },
  counters: { pendingBookingRequests: 2, messageThreadsNeedingReply: 1 },
  priorityRequests: requestRefs.map((requestRef, index) => ({
    requestRef,
    travelerDisplayName: `旅人 ${index + 1}`,
    serviceTitle: index === 0 ? '島嶼散步' : '溪谷慢行',
    startAt: `2026-08-0${index + 1}T02:00:00.000Z`,
    partySize: index + 2,
    receivedAt: `2026-07-2${8 - index}T00:00:00.000Z`,
    paymentDeadlineAt: '2026-07-29T00:15:00.000Z',
    needsReply: index === 0,
  })),
  recentProgress: requestRefs.map((requestRef, index) => ({
    requestRef,
    serviceTitle: index === 0 ? '島嶼散步' : '溪谷慢行',
    bucket: index === 0 ? 'new' : 'replied',
    secondaryState: index === 0 ? 'pending_approval' : 'awaiting_payment',
    updatedAt: `2026-07-2${8 - index}T01:00:00.000Z`,
  })),
  messages: { latestNeedsReplyAt: '2026-07-28T00:30:00.000Z' },
};

const emptyHomeData = {
  profile: { displayName: guide.guideName },
  counters: { pendingBookingRequests: 0, messageThreadsNeedingReply: 0 },
  priorityRequests: [],
  recentProgress: [],
  messages: { latestNeedsReplyAt: null },
};

async function mockHome(
  page: Parameters<typeof loginMidaoGuideViaApi>[0],
  response: { status: number; body: unknown },
  options: { delayMs?: number; calls?: { count: number } } = {},
) {
  await page.route('**/api/v2/guide/home', async (route) => {
    if (options.calls) options.calls.count += 1;
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    });
  });
}

async function attachScreenshot(page: Parameters<typeof loginMidaoGuideViaApi>[0], testInfo: { outputPath: (name: string) => string; attach: (name: string, options: { path: string; contentType: string }) => Promise<void> }, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('Midao home read-only dashboard', () => {
  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 1000 },
  ]) {
    test(`renders the populated home dashboard on ${viewport.name}`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const calls = { count: 0 };
      await mockHome(page, { status: 200, body: { success: true, data: homeData } }, { delayMs: 250, calls });
      await loginMidaoGuideViaApi(page, guide);

      const navigation = page.goto('/midao', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.midao-loading-skeleton')).toBeVisible();
      await navigation;

      await expect(page.getByRole('heading', { name: '首頁' })).toBeVisible();
      await expect(page.getByText(`歡迎回來，${guide.guideName}`)).toBeVisible();
      await expect(page.getByTestId('midao-home-counter-pending')).toContainText('2');
      await expect(page.getByTestId('midao-home-counter-messages')).toContainText('1');
      await expect(page.locator('[data-testid^="midao-home-counter-"]')).toHaveCount(2);
      await expect(page.getByText('詢問總數')).toHaveCount(0);
      await expect(page.getByTestId('midao-home-priority-list').locator('a')).toHaveCount(3);
      await expect(page.getByTestId('midao-home-recent-list').locator('a')).toHaveCount(3);
      await expect(page.getByRole('link', { name: /島嶼散步/ }).first()).toHaveAttribute(
        'href',
        `/midao/requests/${requestRefs[0]}`,
      );
      await expect(page.getByText('待確認的預約')).toBeVisible();
      await expect(page.getByText('待回覆訊息')).toBeVisible();
      await expect(page.getByText('最近進度')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      expect(calls.count).toBe(1);

      await attachScreenshot(page, testInfo, `home-populated-${viewport.name}`);
    });
  }

  test('shows a true empty state only for a successful empty envelope', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await mockHome(page, { status: 200, body: { success: true, data: emptyHomeData } });
    await loginMidaoGuideViaApi(page, guide);

    await page.goto('/midao', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: '首頁' })).toBeVisible();
    await expect(page.getByText('目前沒有待處理需求')).toBeVisible();
    await expect(page.getByText('目前沒有最近進度')).toBeVisible();
    await expect(page.locator('[data-testid^="midao-home-counter-"]')).toHaveCount(2);
    await expect(page.locator('.midao-loading-skeleton')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);

    await attachScreenshot(page, testInfo, 'home-empty');
  });

  test('recovers a GET 409 with a real retry and does not render fallback data', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const calls = { count: 0 };
    await mockHome(page, {
      status: 409,
      body: { success: false, error: { code: 'BACKEND_MODE_MISMATCH', message: 'Guide backend mode conflict' } },
    }, { calls });
    await loginMidaoGuideViaApi(page, guide);
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('alert')).toContainText('目前無法載入導遊首頁');
    await expect(page.getByText('2', { exact: true })).toHaveCount(0);
    await expect(page.getByText('目前沒有待處理需求')).toHaveCount(0);
    await attachScreenshot(page, testInfo, 'home-409-error');

    await page.unroute('**/api/v2/guide/home');
    await mockHome(page, { status: 200, body: { success: true, data: homeData } }, { calls });
    await page.getByRole('button', { name: '再試一次' }).click();

    await expect(page.getByTestId('midao-home-counter-pending')).toContainText('2');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(calls.count).toBe(2);
  });
});
