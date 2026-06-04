import { test as base, expect, Page, APIRequestContext } from '@playwright/test';

const ADMIN_TOKEN = process.env.ADMIN_ACCESS_TOKEN || 'test-token-123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@tour-platform.com';

/**
 * Helper: log in to the admin console via the auth API directly (#1206).
 *
 * History:
 *   - The original helper drove the UI: fill inputs, click submit, wait for
 *     URL change. That had two issues we already fixed in #1118:
 *       (a) `button[type="submit"]` matched the global header search form,
 *           not the login button.
 *       (b) The post-login URL regex accepted /activities*, so a failed
 *           login that bounced to traveler land was silently accepted.
 *   - Even after #1118, the UI path remained flaky under Next dev:
 *     `/admin/login` wraps its form in a `<Suspense>` boundary so
 *     `useSearchParams()` doesn't throw at build, and the boundary
 *     occasionally rerenders mid-fill — Playwright sees the password input
 *     detach from the DOM during `tokenInput.fill()` and times out. This
 *     affects roughly every #1067 sub-family spec that uses `authedPage`
 *     (#1116, #1130, #1132, #1133, #1166, #1178).
 *
 * Fix per #1206 Option B: skip the UI entirely. We mint the session by
 * calling /api/admin/auth/csrf + /api/admin/auth/session through Playwright's
 * own request context, which shares cookies with the page context. After
 * those two POSTs return ok, every cookie middleware needs to authorise
 * /admin/* is set, and `page.goto('/admin/...')` works directly with no
 * form rendering involved at all.
 *
 * Falling back to the old form-driven path is unnecessary — the API
 * surface is the contract; if the API can't issue a session, no UI dance
 * is going to rescue us.
 */
async function loginViaApi(request: APIRequestContext): Promise<void> {
  // 1. Get a CSRF token. Server sets the `tp_csrf` cookie AND echoes the
  //    token in the body — we use the body value so we don't have to read
  //    cookies between two requests in the same tick.
  const csrfRes = await request.get('/api/admin/auth/csrf', { failOnStatusCode: false });
  if (!csrfRes.ok()) {
    throw new Error(`adminLogin: /api/admin/auth/csrf returned ${csrfRes.status()}`);
  }
  const csrfBody = await csrfRes.json().catch(() => ({} as Record<string, unknown>));
  const csrfToken: string =
    (csrfBody as { data?: { csrfToken?: string } })?.data?.csrfToken ?? '';
  if (!csrfToken) {
    throw new Error(`adminLogin: csrf endpoint did not return a token (body=${JSON.stringify(csrfBody)})`);
  }

  // 2. Create the session. Middleware double-submit CSRF guard requires the
  //    header to match the cookie set by step 1.
  const sessionRes = await request.post('/api/admin/auth/session', {
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    data: { token: ADMIN_TOKEN, email: ADMIN_EMAIL },
    failOnStatusCode: false,
  });
  if (!sessionRes.ok()) {
    const body = await sessionRes.text().catch(() => '');
    throw new Error(
      `adminLogin: /api/admin/auth/session returned ${sessionRes.status()} — ${body}\n` +
        `  ADMIN_ACCESS_TOKEN length: ${ADMIN_TOKEN.length}\n` +
        `  ADMIN_EMAIL: ${ADMIN_EMAIL}\n` +
        `Check the dev server has both set in its environment.`,
    );
  }
}

async function adminLogin(page: Page): Promise<void> {
  await loginViaApi(page.request);

  // Sanity-check the cookies the session response set. If admin_token is
  // missing, downstream `page.goto('/admin/...')` will be redirected back
  // to /admin/login and the failing spec would report a baffling
  // "selector not found" instead of "session didn't stick".
  const cookies = await page.context().cookies();
  if (!cookies.some((c) => c.name === 'admin_token' && c.value)) {
    throw new Error(
      `adminLogin: no admin_token cookie after API login. ` +
        `Cookies present: ${cookies.map((c) => c.name).join(', ') || '(none)'}. ` +
        `Check ADMIN_ACCESS_TOKEN / ADMIN_EMAIL_ALLOWLIST.`,
    );
  }

  // Land the page on /admin so callers that read `page.url()` immediately
  // (e.g. t1-login.spec.ts T1.1) match the old form-driven contract.
  await page.goto('/admin');
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
