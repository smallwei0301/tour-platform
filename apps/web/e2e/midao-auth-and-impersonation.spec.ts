import {
  test,
  expect,
  adminLogin,
  setMidaoGuideSession,
  setMidaoImpersonationSession,
} from './helpers';

const midaoGuide = {
  guideId: '99999999-9999-4999-8999-999999999999',
  guideName: 'Midao E2E Guide',
  sessionVersion: 7,
};

const legacyGuide = {
  guideId: '00000000-0000-4000-8000-000000000001',
  guideName: 'Legacy E2E Guide',
  sessionVersion: 1,
};

test.describe('Midao authentication and impersonation on baseline-backed local Supabase', () => {
  test('missing guide session fails closed to same-origin login', async ({ page }) => {
    await page.goto('/midao');
    await expect(page).toHaveURL(/\/guide\/login\?next=%2Fmidao$/);
  });

  test('legacy backend guide returns to the legacy dashboard', async ({ page }) => {
    await setMidaoGuideSession(page, legacyGuide);
    await page.goto('/midao');
    await expect(page).toHaveURL(/\/guide\/dashboard$/);
  });

  test('valid Midao guide session renders the canonical database guide identity without a banner', async ({ page }) => {
    await setMidaoGuideSession(page, midaoGuide);
    await page.goto('/midao');
    await expect(page.getByRole('heading', { name: '首頁' })).toBeVisible();
    await expect(page.getByText(midaoGuide.guideName)).toBeVisible();
    await expect(page.getByTestId('midao-impersonation-banner')).toHaveCount(0);
  });

  test('verified admin impersonation renders a safe banner and can return to admin guides', async ({ page }) => {
    await adminLogin(page);
    await setMidaoImpersonationSession(page, { ...midaoGuide, adminEmail: 'admin@example.invalid' });
    await page.goto('/midao');

    const banner = page.getByTestId('midao-impersonation-banner');
    await expect(banner).toContainText('管理員代入模式');
    await expect(banner).toContainText(midaoGuide.guideName);
    await expect(banner).not.toContainText('admin@example.invalid');
    await banner.getByRole('button', { name: '結束代入' }).click();
    await expect(page).toHaveURL(/\/admin\/guides$/);
  });
});
