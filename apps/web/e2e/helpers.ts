import { test as base, expect, Page, Locator, APIRequestContext } from '@playwright/test';
import { createImpersonationActorCookie } from '../src/lib/midao/impersonation-actor';

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

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3333';

/**
 * Helper: mint a *format-valid* guide session for browser-layer specs (#1273).
 *
 * Edge middleware (`verifyGuideSessionMiddleware`) only does a lightweight
 * format check for `/guide/*` pages — token shaped `guideId:version:signature`
 * with a 64-char signature, plus a matching `guide_id` cookie. Full HMAC
 * verification happens exclusively in the real `/api/guide/*` routes, which
 * guide UI specs mock via `page.route(...)`. So a fake 64-char signature is
 * enough to render the page without ever touching real auth or weakening it —
 * the security contract still lives in the API routes and their unit tests.
 */
/**
 * Helper: 假 traveler session（#1379/#1381）。
 *
 * `/me/**`、checkout 等頁面以 client-side `supabase.auth.getUser()` 做登入
 * gate。播種 `sb-127-auth-token` session cookie（ref 取自
 * NEXT_PUBLIC_SUPABASE_URL host 首段 = 127.0.0.1）並攔截 `auth/v1/user`
 * 回傳假 user，即可在不碰真實 Supabase 的情況下通過 gate。
 */
const TRAVELER_FAKE_USER = {
  id: 'traveler-e2e',
  email: 'traveler-e2e@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

async function setTravelerSession(page: Page, user: Record<string, unknown> = TRAVELER_FAKE_USER): Promise<void> {
  const session = {
    access_token: 'fake-access-token-e2e',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fake-refresh-token',
    user,
  };
  await page.context().addCookies([
    { name: 'sb-127-auth-token', value: encodeURIComponent(JSON.stringify(session)), url: BASE_URL },
    { name: 'tp_csrf', value: 'e2e-csrf-token', url: BASE_URL },
  ]);
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
  });
  await page.route('**/api/me/csrf**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

async function setGuideSession(page: Page, guideId: string): Promise<void> {
  const fakeSignature = 'a'.repeat(64);
  await page.context().addCookies([
    { name: 'guide_token', value: `${guideId}:1:${fakeSignature}`, url: BASE_URL },
    { name: 'guide_id', value: guideId, url: BASE_URL },
  ]);
}

interface MidaoGuideLoginInput {
  guideId: string;
  email: string;
  password: string;
  expectedRedirect: '/midao' | '/guide/dashboard';
}

interface MidaoImpersonationActorInput {
  guideId: string;
  adminEmail: string;
  issuedAt?: number;
}

async function loginMidaoGuideViaApi(page: Page, input: MidaoGuideLoginInput): Promise<void> {
  const csrfRes = await page.request.get('/api/guide/auth/csrf', { failOnStatusCode: false });
  const csrfBody = await csrfRes.json().catch(() => ({} as Record<string, unknown>));
  const csrfToken = (csrfBody as { data?: { csrfToken?: string } })?.data?.csrfToken ?? '';
  if (!csrfRes.ok() || !csrfToken) {
    throw new Error(`loginMidaoGuideViaApi: csrf failed with status ${csrfRes.status()}`);
  }

  const sessionRes = await page.request.post('/api/guide/auth/session', {
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    data: { email: input.email, password: input.password },
    failOnStatusCode: false,
  });
  const sessionBody = await sessionRes.json().catch(() => ({} as Record<string, unknown>));
  const sessionData = (sessionBody as { data?: { created?: boolean; redirectTo?: string }; error?: { code?: string } }).data;
  if (!sessionRes.ok() || sessionData?.created !== true || sessionData.redirectTo !== input.expectedRedirect) {
    const errorCode = (sessionBody as { error?: { code?: string } }).error?.code ?? 'INVALID_RESPONSE';
    throw new Error(`loginMidaoGuideViaApi: session failed with status ${sessionRes.status()} code ${errorCode}`);
  }

  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === 'guide_token' && cookie.value);
  const guideId = cookies.find((cookie) => cookie.name === 'guide_id' && cookie.value === input.guideId);
  if (!token || !guideId) {
    throw new Error(`loginMidaoGuideViaApi: canonical guide cookies missing; present=${cookies.map((cookie) => cookie.name).join(',')}`);
  }
}

async function setMidaoImpersonationActorCookie(
  page: Page,
  input: MidaoImpersonationActorInput,
): Promise<void> {
  const actorSetCookie = createImpersonationActorCookie({
    adminEmail: input.adminEmail,
    targetGuideId: input.guideId,
    issuedAt: input.issuedAt,
  });
  const actorPair = actorSetCookie.split(';', 1)[0];
  const separator = actorPair.indexOf('=');
  if (separator < 1 || !actorPair.slice(separator + 1)) {
    throw new Error('setMidaoImpersonationActorCookie: signed actor cookie was not created');
  }
  await page.context().addCookies([
    {
      name: actorPair.slice(0, separator),
      value: actorPair.slice(separator + 1),
      url: BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
    { name: 'guide_impersonation', value: '1', url: BASE_URL, sameSite: 'Lax' },
  ]);
}

/**
 * Helper: 填一組受控欄位，並確保值撐過 hydration。
 *
 * Next dev 下 client component 的 SSR HTML 先到、React 才接上事件。若 `fill()`
 * 落在 hydration 之前，React 掛載後會用初始 state（空字串）重繪，把剛打進去的
 * 值直接抹掉 —— 症狀是後面欄位都正常、只有最前面一兩個莫名是空的，表單於是
 * 永遠停在「必填未完成」、送出鈕不會 enable。
 *
 * 單獨回讀某一欄不夠：那一刻值可能還在，hydration 稍後才抹掉。所以這裡「全部
 * 填完再全部回讀」，只要有任一欄被抹掉就整組重填，直到全部穩定。
 */
async function fillFormHydrated(page: Page, entries: [selector: string, value: string][]) {
  await expect(async () => {
    for (const [selector, value] of entries) await page.locator(selector).fill(value);
    for (const [selector, value] of entries) {
      expect(await page.locator(selector).inputValue()).toBe(value);
    }
  }).toPass({ timeout: 20_000 });
}

/**
 * Helper: 點一個「展開型」按鈕，直到它真的展開為止。
 *
 * 與 fillFormHydrated 同源問題（見 lessons.md 2026-07-30）：`goto()` 後立刻
 * `click()` 可能落在 hydration 之前，onClick 還沒掛上 → 點了等於沒點，接著
 * 等展開內容就 timeout。
 *
 * 這裡用 React 控制的 `aria-expanded` 當成功信號並重試點擊。**前提是該按鈕
 * 只會開、不會 toggle**（例如 `setOpen(true)`），否則重試會把它關回去。
 */
async function clickUntilExpanded(locator: Locator) {
  await expect(async () => {
    await locator.click();
    await expect(locator).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
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

export {
  test,
  expect,
  adminLogin,
  ensureLoggedIn,
  setGuideSession,
  setTravelerSession,
  loginMidaoGuideViaApi,
  setMidaoImpersonationActorCookie,
  fillFormHydrated,
  clickUntilExpanded,
};
