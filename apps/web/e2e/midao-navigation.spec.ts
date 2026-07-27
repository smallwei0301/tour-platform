import { test, expect, setMidaoGuideSession } from './helpers';

const guide = {
  guideId: '99999999-9999-4999-8999-999999999999',
  guideName: 'Midao E2E Guide',
  sessionVersion: 1,
};

const destinations = [
  ['/midao', '首頁'],
  ['/midao/requests', '需求'],
  ['/midao/calendar', '行事曆'],
  ['/midao/services', '服務'],
  ['/midao/me', '我的頁面'],
] as const;

test.describe('Midao primary navigation on baseline-backed local Supabase', () => {
  test.beforeEach(async ({ page }) => {
    await setMidaoGuideSession(page, guide);
  });

  for (const [path, label] of destinations) {
    test(`${label} renders through the verified Midao page-session boundary`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}/?$`));
      await expect(page.getByRole('heading', { name: label })).toBeVisible();
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByTestId('midao-impersonation-banner')).toHaveCount(0);
    });
  }

  test('desktop links navigate between all approved destinations without leaving Midao', async ({ page }) => {
    await page.goto('/midao');
    for (const [path, label] of destinations.slice(1)) {
      await page.getByRole('link', { name: label }).first().click();
      await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}/?$`));
      await expect(page.getByRole('heading', { name: label })).toBeVisible();
    }
  });
});
