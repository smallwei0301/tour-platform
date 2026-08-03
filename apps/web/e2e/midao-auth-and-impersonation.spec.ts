import {
  test,
  expect,
  adminLogin,
  loginMidaoGuideViaApi,
  setGuideSession,
  setMidaoImpersonationActorCookie,
} from './helpers';
import type { Page } from '@playwright/test';

const midaoGuide = {
  guideId: '99999999-9999-4999-8999-999999999999',
  guideName: 'Midao E2E Guide',
  email: 'midao-e2e@example.invalid',
  password: 'midao-e2e-only-password',
  expectedRedirect: '/midao' as const,
};

const legacyGuide = {
  guideId: '00000000-0000-4000-8000-000000000001',
  guideName: 'Legacy E2E Guide',
  email: 'legacy-e2e@example.invalid',
  password: 'legacy-e2e-only-password',
  expectedRedirect: '/guide/dashboard' as const,
};

const hostileRedirects = [
  'https://evil.example/midao',
  '//evil.example/midao',
  '/midao\\requests',
  '/midao/%2frequests',
  '/midao/%5crequests',
  '/midao/%252frequests',
  '/midao/%255crequests',
  '/midao/%',
  '/midao/%zz',
  '/guide/dashboard',
] as const;

function observeNavigationOrigins(page: Page) {
  const runnerOrigin = new URL(page.url()).origin;
  const escaped: string[] = [];
  page.on('request', (request) => {
    if (request.isNavigationRequest() && new URL(request.url()).origin !== runnerOrigin) escaped.push(request.url());
  });
  return { runnerOrigin, escaped };
}

async function loginMidaoGuideViaUi(page: Page, next: string | null) {
  const query = next === null ? '' : `?next=${encodeURIComponent(next)}`;
  await page.goto(`/guide/login${query}`, { waitUntil: 'networkidle' });
  await page.getByLabel('電子信箱').fill(midaoGuide.email);
  await page.getByLabel('密碼').fill(midaoGuide.password);
  await page.getByRole('button', { name: '登入', exact: true }).click({ noWaitAfter: true });
}

async function beginRealAdminImpersonation(page: Page) {
  await adminLogin(page);
  await page.goto(`/admin/guides/${midaoGuide.guideId}`, { waitUntil: 'domcontentloaded' });
  const enter = page.getByTestId('admin-enter-guide-backend');
  await expect(enter).toBeVisible({ timeout: 60_000 });
  await enter.click({ noWaitAfter: true });
  await page.waitForURL(/\/midao\/?$/, { waitUntil: 'commit', timeout: 60_000 });
  const banner = page.getByTestId('midao-impersonation-banner');
  await expect(banner).toContainText('管理員代入模式');
  await expect(banner).toContainText(midaoGuide.guideName);
  await expect(banner).not.toContainText('admin@example.invalid');
  return banner;
}

test.describe('Midao authentication and impersonation on baseline-backed local Supabase', () => {
  test.describe.configure({ timeout: 180_000 });

  test('missing guide session fails closed to same-origin login with a safe next', async ({ page }) => {
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/guide\/login\?next=%2Fmidao$/, { waitUntil: 'commit', timeout: 60_000 });
    expect(new URL(page.url()).pathname).toBe('/guide/login');
  });

  test('legacy backend guide returns to the legacy dashboard', async ({ page }) => {
    await loginMidaoGuideViaApi(page, legacyGuide);
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/guide\/dashboard$/, { waitUntil: 'commit', timeout: 60_000 });
  });

  test('fake 64-character guide signature cannot cross the real Midao server-auth boundary', async ({ page }) => {
    await setGuideSession(page, midaoGuide.guideId);
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/guide\/login\?next=%2Fmidao$/, { waitUntil: 'commit', timeout: 60_000 });
  });

  test('valid Midao HMAC session renders canonical database identity without a banner', async ({ page }) => {
    await loginMidaoGuideViaApi(page, midaoGuide);
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '首頁' })).toBeVisible();
    await expect(page.locator('main .midao-home-welcome')).toHaveText(`歡迎回來，${midaoGuide.guideName}`);
    await expect(page.getByTestId('midao-impersonation-banner')).toHaveCount(0);
  });

  test('real admin guide page and real impersonation API issue a bound session and safe banner', async ({ page }) => {
    const banner = await beginRealAdminImpersonation(page);
    const cookies = await page.context().cookies();
    for (const required of ['guide_token', 'guide_id', 'midao_impersonation_actor', 'guide_impersonation']) {
      expect(cookies.some((cookie) => cookie.name === required && cookie.value)).toBe(true);
    }
    const endButton = banner.getByRole('button', { name: '結束代入' });
    await expect(endButton).toBeEnabled();
    await endButton.click({ noWaitAfter: true });
    await page.waitForURL(/\/admin\/guides$/, { waitUntil: 'commit', timeout: 60_000 });
  });

  test('forged actor cookie rejects the cryptographically bound impersonation session', async ({ page }) => {
    await beginRealAdminImpersonation(page);
    const actor = (await page.context().cookies()).find((cookie) => cookie.name === 'midao_impersonation_actor');
    expect(actor).toBeTruthy();
    const last = actor!.value.at(-1) === 'a' ? 'b' : 'a';
    await page.context().addCookies([{
      name: actor!.name,
      value: `${actor!.value.slice(0, -1)}${last}`,
      url: new URL(page.url()).origin,
      httpOnly: true,
      sameSite: 'Lax',
    }]);
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/guide\/login\?next=%2Fmidao$/, { waitUntil: 'commit', timeout: 60_000 });
  });

  test('expired actor cookie rejects the cryptographically bound impersonation session', async ({ page }) => {
    await beginRealAdminImpersonation(page);
    await setMidaoImpersonationActorCookie(page, {
      guideId: midaoGuide.guideId,
      adminEmail: 'admin@example.invalid',
      issuedAt: Date.now() - (60 * 60 * 1000) - 1,
    });
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/guide\/login\?next=%2Fmidao$/, { waitUntil: 'commit', timeout: 60_000 });
  });

  test('ordinary seeded-account UI login clears actor and visible-banner cookies', async ({ page }) => {
    const banner = await beginRealAdminImpersonation(page);
    await banner.getByRole('button', { name: '結束代入' }).click({ noWaitAfter: true });
    await page.waitForURL(/\/admin\/guides$/, { waitUntil: 'commit', timeout: 60_000 });

    await setMidaoImpersonationActorCookie(page, {
      guideId: midaoGuide.guideId,
      adminEmail: 'admin@example.invalid',
    });
    await loginMidaoGuideViaUi(page, null);
    await page.waitForURL(/\/midao\/?$/, { waitUntil: 'commit', timeout: 60_000 });
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === 'midao_impersonation_actor')).toBe(false);
    expect(cookies.some((cookie) => cookie.name === 'guide_impersonation')).toBe(false);
    await expect(page.getByTestId('midao-impersonation-banner')).toHaveCount(0);
  });

  test('real guide login UI/API honors safe next and rejects the complete hostile matrix on localhost', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/guide/login', { waitUntil: 'domcontentloaded' });
    const { runnerOrigin, escaped } = observeNavigationOrigins(page);

    await loginMidaoGuideViaUi(page, '/midao/services?draft=1');
    await page.waitForURL(/\/midao\/services\?draft=1$/, { waitUntil: 'commit', timeout: 60_000 });
    expect(new URL(page.url()).origin).toBe(runnerOrigin);

    for (const hostile of hostileRedirects) {
      await page.context().clearCookies();
      await loginMidaoGuideViaUi(page, hostile);
      await page.waitForURL(/\/midao\/?$/, { waitUntil: 'commit', timeout: 60_000 });
      expect(new URL(page.url()).origin, hostile).toBe(runnerOrigin);
    }
    expect(escaped).toEqual([]);
  });

  test('admin negative API redirects all fail closed through /guide/dashboard without external navigation', async ({ page }) => {
    test.setTimeout(300_000);
    let serverRedirect = hostileRedirects[0] as string;
    await page.route('**/api/v2/admin/guides/*/impersonate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { redirectTo: serverRedirect } }),
      });
    });

    let runnerOrigin = '';
    const escaped: string[] = [];
    page.on('request', (request) => {
      if (runnerOrigin && request.isNavigationRequest() && new URL(request.url()).origin !== runnerOrigin) escaped.push(request.url());
    });

    for (const hostile of hostileRedirects) {
      serverRedirect = hostile;
      await page.context().clearCookies();
      await adminLogin(page);
      await page.goto(`/admin/guides/${midaoGuide.guideId}`, { waitUntil: 'domcontentloaded' });
      runnerOrigin = new URL(page.url()).origin;
      const dashboardNavigation = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return request.isNavigationRequest() && url.origin === runnerOrigin && url.pathname === '/guide/dashboard';
      }, { timeout: 60_000 });
      const enter = page.getByTestId('admin-enter-guide-backend');
      await expect(enter).toBeVisible({ timeout: 60_000 });
      await enter.click({ noWaitAfter: true });
      const request = await dashboardNavigation;
      expect(new URL(request.url()).origin, hostile).toBe(runnerOrigin);
    }
    expect(escaped).toEqual([]);
  });
});
