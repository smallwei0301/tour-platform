import {
  test,
  expect,
  adminLogin,
  loginMidaoGuideViaApi,
  setMidaoImpersonationActorCookie,
} from './helpers';

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

test.describe('Midao authentication and impersonation on baseline-backed local Supabase', () => {
  test.describe.configure({ timeout: 60_000 });

  test('missing guide session fails closed to same-origin login', async ({ page }) => {
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/guide\/login\?next=%2Fmidao$/, { timeout: 15_000 });
  });

  test('legacy backend guide returns to the legacy dashboard', async ({ page }) => {
    await loginMidaoGuideViaApi(page, legacyGuide);
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/guide\/dashboard$/, { timeout: 15_000 });
  });

  test('valid Midao guide session renders the canonical database guide identity without a banner', async ({ page }) => {
    await loginMidaoGuideViaApi(page, midaoGuide);
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '首頁' })).toBeVisible();
    await expect(page.getByText(midaoGuide.guideName)).toBeVisible();
    await expect(page.getByTestId('midao-impersonation-banner')).toHaveCount(0);
  });

  test('verified admin impersonation renders a safe banner and can return to admin guides', async ({ page }) => {
    await adminLogin(page);
    await loginMidaoGuideViaApi(page, midaoGuide);
    await setMidaoImpersonationActorCookie(page, { guideId: midaoGuide.guideId, adminEmail: 'admin@example.invalid' });
    await page.goto('/midao', { waitUntil: 'domcontentloaded' });

    const banner = page.getByTestId('midao-impersonation-banner');
    await expect(banner).toContainText('管理員代入模式');
    await expect(banner).toContainText(midaoGuide.guideName);
    await expect(banner).not.toContainText('admin@example.invalid');
    const endButton = banner.getByRole('button', { name: '結束代入' });
    await expect(endButton).toBeEnabled({ timeout: 15_000 });
    await endButton.click();
    await page.waitForURL(/\/admin\/guides$/, { timeout: 15_000 });
  });
});
