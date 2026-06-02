import { test as base, expect, Page } from '@playwright/test';

const ADMIN_TOKEN = process.env.ADMIN_ACCESS_TOKEN || 'test-token-123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@tour-platform.com';

/**
 * Helper: log in to the admin console and store session cookies. Fixes #1118.
 *
 * The old version called `page.click('button[type="submit"]')` and then
 * `waitForURL(...)` with no other signal. Two cooperating bugs:
 *
 *   1. The global header carries its own `<form aria-label="搜尋">` with a
 *      submit button — `button[type="submit"]` (DOM order) matched THAT
 *      button first, so the click triggered a navigation to /activities
 *      and the login form was never submitted. `waitForURL` then accepted
 *      /activities (the regex allowed either `/admin*` or `/activities*`)
 *      and the fixture silently returned without ever logging in.
 *   2. Every downstream `page.goto('/admin/...')` was redirected back to
 *      /admin/login by middleware. Specs that asserted on admin DOM (e.g.
 *      `waitForSelector('select')`) failed with "element not found"
 *      instead of "login didn't happen", which was very confusing.
 *
 * Fix:
 *   - Target the submit button by its visible label `'登入'`.
 *   - Throw a loud, specific error if the URL stays on /admin/login OR
 *     if `admin_token` cookie isn't set afterwards.
 *   - Retry once before throwing, to tolerate Next-dev fast-refresh races
 *     when a long suite has been hammering the dev server.
 */
async function adminLogin(page: Page, attempt = 1): Promise<void> {
  // Force deterministic post-login target to avoid env-specific next redirects.
  await page.goto('/admin/login?next=/admin', { waitUntil: 'domcontentloaded' });

  const tokenInput = page.locator('input[type="password"]');
  await tokenInput.waitFor({ state: 'visible', timeout: 10_000 });
  await tokenInput.fill(ADMIN_TOKEN);
  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.count() > 0) {
    await emailInput.fill(ADMIN_EMAIL);
  }

  // See the header doc on the function for why this selector is by label.
  await page.locator('button[type="submit"]', { hasText: '登入' }).click();

  // Wait for the page to leave /admin/login. On success the page does
  // `window.location.assign(next)` — a full document navigation — so the
  // URL change is the user-visible contract. We deliberately avoid
  // `waitForResponse` here because the response listener races the
  // navigation that tears down the page.
  try {
    await page.waitForURL(
      (url) => !/\/admin\/login(\?|$|#)/.test(url.pathname + url.search),
      { timeout: 15_000 },
    );
  } catch {
    // Still on /admin/login → login failed. Surface the on-screen error
    // (the page renders a red banner from `setError(...)`) so spec
    // failures show the real reason instead of "timeout".
    const detail = await page
      .locator('div', { hasText: '⚠️' })
      .first()
      .textContent({ timeout: 1_000 })
      .catch(() => '');

    // Dev mode is racy under heavy fast-refresh churn (especially after a
    // long suite has been hammering the same dev server). Give it one
    // retry before reporting failure.
    if (attempt < 2) {
      await page.waitForTimeout(800);
      return adminLogin(page, attempt + 1);
    }

    throw new Error(
      `adminLogin: still on /admin/login after click (attempt ${attempt}) — ${detail || 'no on-screen error'}\n` +
        `  ADMIN_ACCESS_TOKEN length: ${ADMIN_TOKEN.length}\n` +
        `  ADMIN_EMAIL: ${ADMIN_EMAIL}\n` +
        `Check the dev server has these in its environment.`,
    );
  }

  // Sanity-check the post-login cookies. Without admin_token, downstream
  // `page.goto('/admin/...')` calls will be redirected back to login by
  // middleware — and the failing spec would report a baffling "selector
  // not found" instead of "login didn't set cookies".
  const cookies = await page.context().cookies();
  if (!cookies.some((c) => c.name === 'admin_token' && c.value)) {
    throw new Error(
      `adminLogin: no admin_token cookie after click (landed=${page.url()}). ` +
        `Login response did not Set-Cookie — check ADMIN_ACCESS_TOKEN / ADMIN_EMAIL_ALLOWLIST.`,
    );
  }

  // Accept either /admin* or /activities* — some preview envs fall back
  // to /activities when middleware soft-rejects admin access.
  const landed = new URL(page.url()).pathname;
  if (!/^\/(admin|activities)(\/|$)/.test(landed)) {
    throw new Error(`adminLogin: unexpected post-login URL ${page.url()}`);
  }
}

/** Helper: ensure logged in (re-login if session expired) */
async function ensureLoggedIn(page: Page) {
  const body = await page.locator('body').textContent().catch(() => '');
  if (body?.includes('Access Denied') || body?.includes('login') || body?.includes('登入')) {
    await adminLogin(page);
  }
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

export { test, expect, adminLogin, ensureLoggedIn };
