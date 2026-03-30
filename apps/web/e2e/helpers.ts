import { test as base, expect, Page } from '@playwright/test';

const ADMIN_TOKEN = process.env.ADMIN_ACCESS_TOKEN || 'test-token-123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@tour-platform.com';

/** Helper: login and store session cookies */
async function adminLogin(page: Page) {
  await page.goto('/admin/login');
  await page.waitForSelector('input[type="password"]');
  await page.fill('input[type="password"]', ADMIN_TOKEN);
  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.count() > 0) {
    await emailInput.fill(ADMIN_EMAIL);
  }
  await page.click('button[type="submit"]');
  // Wait for redirect away from login
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
}

/** Fixture: authenticated page + isMobile flag */
const test = base.extend<{ authedPage: Page; isMobile: boolean }>({
  authedPage: async ({ page }, use) => {
    await adminLogin(page);
    await use(page);
  },
  isMobile: async ({ viewport }, use) => {
    const mobile = (viewport?.width ?? 1280) < 768;
    await use(mobile);
  },
});

export { test, expect, adminLogin };
