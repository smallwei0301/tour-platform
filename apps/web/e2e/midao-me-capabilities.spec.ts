import { expect, test, type Page } from '@playwright/test';
import { loginMidaoGuideViaApi } from './helpers';

const guide = {
  guideId: '99999999-9999-4999-8999-999999999999',
  guideName: 'Midao E2E Guide',
  email: 'midao-e2e@example.invalid',
  password: 'midao-e2e-only-password',
  expectedRedirect: '/midao' as const,
};

const homePayload = {
  success: true,
  data: {
    profile: { displayName: '能力中心導遊' },
    counters: { pendingBookingRequests: 2, messageThreadsNeedingReply: 3 },
    priorityRequests: [],
    recentProgress: [],
    messages: { latestNeedsReplyAt: null },
  },
};

const servicesPayload = {
  success: true,
  data: { items: [], page: 1, pageSize: 1, total: 4, totalPages: 4 },
};

async function installCapabilityRoutes(page: Page) {
  await page.route('**/api/v2/guide/home', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(homePayload) });
  });
  await page.route('**/api/v2/guide/services**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(servicesPayload) });
  });
}

test('capability centre shows canonical read summaries, safe destinations, retry and responsive keyboard links', async ({ page }) => {
  test.setTimeout(180_000);
  await installCapabilityRoutes(page);
  await loginMidaoGuideViaApi(page, guide);
  await page.goto('/midao/me', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: '我的頁面' })).toBeVisible();
  await expect(page.getByText('4 項服務', { exact: true })).toBeVisible();
  await expect(page.getByText('待確認 2・待回覆 3', { exact: true })).toBeVisible();
  await expect(page.getByText('能力中心導遊', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /服務管理/ })).toHaveAttribute('href', '/midao/services');
  await expect(page.getByRole('link', { name: /預約與需求/ })).toHaveAttribute('href', '/midao/requests');
  await expect(page.getByRole('link', { name: /公開頁面與通知/ })).toHaveAttribute(
    'href',
    '/midao/legacy/public-profile?returnTo=%2Fmidao%2Fme',
  );

  await page.route('**/api/guide/auth/csrf', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/guide/profile', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
  });
  await page.getByRole('link', { name: /公開頁面與通知/ }).click();
  await expect(page).toHaveURL(/\/guide\/profile\?returnTo=%2Fmidao%2Fme$/, { timeout: 45_000 });
  await expect(page.getByRole('link', { name: /返回祕島/ })).toHaveAttribute('href', '/midao/me');

  await page.goto('/midao/me', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('4 項服務', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const servicesLink = page.getByRole('link', { name: /服務管理/ });
  await servicesLink.focus();
  await expect(servicesLink).toBeFocused();
  expect(await servicesLink.evaluate((element: Element) => element.matches(':focus-visible'))).toBe(true);

  let failedOnce = false;
  await page.route('**/api/v2/guide/home', async (route) => {
    if (!failedOnce) {
      failedOnce = true;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(homePayload) });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const errorAlert = page.locator('[role="alert"]', { hasText: '目前無法載入能力中心' });
  await expect(errorAlert).toContainText('目前無法載入能力中心');
  await expect(errorAlert).not.toContainText('server');
  await page.getByRole('button', { name: '再試一次' }).click();
  await expect(page.getByText('4 項服務', { exact: true })).toBeVisible();
});
