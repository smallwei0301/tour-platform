import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server.js';
import type { NextRequest } from 'next/server.js';

import { isAdminAuthorized } from './src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from './src/lib/admin-session.mjs';
import { getControls, isWhitelisted } from './src/lib/soft-launch.mjs';
import { routing } from './src/i18n/routing.ts';

// 多語言（#multilingual Phase 0.5 PoC）：next-intl middleware 處理 locale 偵測、
// NEXT_LOCALE cookie 與 as-needed 內部 rewrite（zh-Hant 不加前綴）。只對「已搬進
// app/[locale] 的公開頁」委派；admin/guide/api/auth 永不帶前綴、行為 0 變動。
//
// 注意：next-intl/middleware 內部以 bundler 解析 import `next/server`（無副檔名），
// 在 node --test 直接載入 middleware.ts 時會解不了。改用 lazy dynamic import + 記憶化，
// 讓非 localized 路徑（admin/guide/api 等既有測試）載入 middleware.ts 時完全不觸碰
// next-intl，維持既有測試綠燈；首次 localized 請求才載入並快取 handler。
let intlMiddlewarePromise: Promise<(req: NextRequest) => NextResponse | Promise<NextResponse>> | null = null;
function getIntlMiddleware() {
  if (!intlMiddlewarePromise) {
    intlMiddlewarePromise = import('next-intl/middleware').then(({ default: create }) => create(routing));
  }
  return intlMiddlewarePromise;
}

// 非預設 locale 的 URL 前綴（zh-Hant 為預設、無前綴）。
const LOCALE_PREFIXES = ['en', 'ja', 'ko'] as const;

/** 去掉 locale 前綴，回傳內部 pathname（供既有 startsWith 比對沿用）。 */
function stripLocalePrefix(pathname: string): string {
  for (const l of LOCALE_PREFIXES) {
    if (pathname === `/${l}`) return '/';
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1);
  }
  return pathname;
}

/**
 * 已搬進 app/[locale] 的公開頁交給 next-intl 處理 locale rewrite；其餘 root 層頁面
 * （about/blog/booking…尚未搬遷）不交給 next-intl（交了會被 rewrite 成 /zh-Hant/* 而 404）。
 * 全面搬遷進行中：首頁、/activities、/theme/* 已完成。
 */
function isLocalizedPublicPath(rest: string): boolean {
  return rest === '/'
    || rest === '/activities' || rest.startsWith('/activities/')
    || rest === '/theme' || rest.startsWith('/theme/')
    // /guides 列表頁與 /guides/[slug] 個人頁已搬進 [locale]；但 /guides/[slug]/shop
    // （app 化的訂房流程）仍在 root。故 localize 列表（exact）與「只有一段 slug」的
    // 個人頁（`/guides/<slug>`），但排除任何更深的 shop 子路徑。
    || rest === '/guides'
    || /^\/guides\/[^/]+$/.test(rest)
    // 純靜態資訊頁（單頁、無動態子路由）。
    || rest === '/about' || rest === '/why-choose-us' || rest === '/faq' || rest === '/contact'
    // blog（含 [slug]）與 legal（privacy/terms/refund）整棵子樹搬進 [locale]。
    || rest === '/blog' || rest.startsWith('/blog/')
    || rest === '/legal' || rest.startsWith('/legal/')
    // experiences/[slug] 體驗詳情頁。
    || rest === '/experiences' || rest.startsWith('/experiences/');
}

function pickToken(req: NextRequest): string {
  // Security: never read admin credentials from URL query params.
  return req.headers.get('x-admin-token') || req.cookies.get('admin_token')?.value || '';
}

function pickEmail(req: NextRequest): string {
  // Security: never read admin credentials from URL query params.
  return req.headers.get('x-admin-email') || req.cookies.get('admin_email')?.value || '';
}

function hasAdminCredential(req: NextRequest): boolean {
  return !!(req.headers.get('x-admin-token') || req.cookies.get('admin_token')?.value);
}

const CSRF_COOKIE_NAME = 'tp_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

function hasTravelerAuthCookie(req: NextRequest): boolean {
  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : '';
  const suffix = supabaseHost ? `-${supabaseHost.split('.')[0]}-auth-token` : '-auth-token';

  return req.cookies.getAll().some(({ name }) => {
    if (!name) return false;
    if (name === 'sb-access-token' || name === 'sb-refresh-token') return true;
    if (name === 'sb-token' || name === 'sb-auth-token') return true;
    return name.includes(suffix) || name.endsWith('-auth-token') || /^(?:sb-|sb-auth-)/.test(name);
  });
}

/**
 * Lightweight guide session check for edge middleware.
 * Verifies format + guideId match. Full HMAC verification happens in API
 * routes via verifyGuideSession() (Node.js crypto, not available in edge).
 */
function verifyGuideSessionMiddleware(req: NextRequest): boolean {
  const rawToken = req.cookies.get('guide_token')?.value || '';
  const guideId = req.cookies.get('guide_id')?.value || '';
  if (!rawToken || !guideId) return false;
  const parts = rawToken.split(':');
  if (parts.length !== 3) return false;
  const [tokenGuideId, sessionVersion, signature] = parts;
  return tokenGuideId === guideId && !!sessionVersion && signature.length === 64;
}

function hasValidCsrf(req: NextRequest): boolean {
  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value || '';
  const headerToken = req.headers.get(CSRF_HEADER_NAME) || '';
  return !!cookieToken && !!headerToken && cookieToken === headerToken;
}

function shouldRequireCsrf(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();
  const isMutation = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  if (!isMutation) return false;

  if (!(
    pathname.startsWith('/api/admin/') ||
    pathname.startsWith('/api/v2/admin/') ||
    pathname.startsWith('/api/guide/') ||
    pathname.startsWith('/api/me/') ||
    pathname.startsWith('/api/reviews')
  )) {
    return false;
  }

  // CSRF token issuance endpoints and non-session login are exempt.
  if (pathname === '/api/guide/auth/csrf' || pathname === '/api/admin/auth/csrf' || pathname === '/api/me/csrf') {
    return false;
  }
  if (pathname === '/api/admin/auth/session' && method === 'POST') {
    return false;
  }

  // Apply only to cookie/session-authenticated mutation requests.
  if (pathname.startsWith('/api/admin/') || pathname.startsWith('/api/v2/admin/')) {
    return !!req.cookies.get('admin_token')?.value;
  }
  if (pathname.startsWith('/api/guide/')) return !!req.cookies.get('guide_token')?.value;
  if (pathname.startsWith('/api/me/')) return hasTravelerAuthCookie(req);
  if (pathname.startsWith('/api/reviews')) return hasTravelerAuthCookie(req);
  // legacy /api/orders 的 CSRF gating（健檢 v2 S4）已隨 #1407 route 刪除一併移除。

  return false;
}

/**
 * Returns a minimal read-only Supabase client suitable for edge middleware.
 * Uses the public anon key — no service-role credentials needed for
 * soft_launch_controls (readable by anon with appropriate RLS).
 */
function createSoftLaunchClient(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      // We don't need to set cookies for a read-only check.
      setAll() {},
    },
  });
}

/**
 * Returns a NextResponse that blocks the request when `public_paused=true`
 * and the visitor is not whitelisted. Returns `null` if the request should
 * proceed normally.
 *
 * Fail-open: if getControls() throws, returns null (treat public_paused as false).
 */
async function applyPublicPausedGuard(req: NextRequest): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;

  // Admin, guide, and auth routes are always exempt.
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/v2/admin') ||
    pathname.startsWith('/guide') ||
    pathname.startsWith('/api/guide') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth')
  ) {
    return null;
  }

  try {
    const supabase = createSoftLaunchClient(req);
    if (!supabase) return null; // no env vars — fail open

    const controls = await getControls(supabase);
    if (!controls.public_paused) return null; // site is open

    // Site is paused. Check whitelist if enabled.
    if (controls.whitelist_enabled) {
      // Identify traveler by Supabase auth user id (from cookie).
      let userId: string | undefined;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        userId = user?.id ?? undefined;
      } catch {
        // Cannot resolve user — treat as non-whitelisted.
      }

      if (userId) {
        const allowed = await isWhitelisted(supabase, { userId, activityId: undefined, guideId: undefined });
        if (allowed) return null; // whitelisted — let through
      }
    }

    // Block the request: return JSON 503 for API routes, redirect for page routes.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'PUBLIC_PAUSED',
            message: '網站目前暫停開放，請稍後再試',
          },
        },
        { status: 503 }
      );
    }

    // Page route: redirect to /maintenance
    const url = req.nextUrl.clone();
    url.pathname = '/maintenance';
    return NextResponse.redirect(url);
  } catch {
    // Fail-open: any unexpected error is treated as public_paused=false.
    console.warn('[middleware] applyPublicPausedGuard error — failing open', {
      path: req.nextUrl.pathname,
    });
    return null;
  }
}

function resolveRefreshTimeoutMs(): number {
  const raw = Number(process.env.SUPABASE_MIDDLEWARE_REFRESH_TIMEOUT_MS || 1200);
  if (!Number.isFinite(raw)) return 1200;
  // guardrail: avoid too short/noisy and too long/blocking values
  return Math.max(300, Math.min(3000, Math.floor(raw)));
}

async function refreshTravelerSession(req: NextRequest): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return NextResponse.next();

  const response = NextResponse.next();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const timeoutMs = resolveRefreshTimeoutMs();
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`supabase refresh timeout (${timeoutMs}ms)`)), timeoutMs)
      ),
    ]);
    return response;
  } catch (error) {
    // Telemetry: keep request non-blocking but leave a breadcrumb in logs.
    console.warn('[middleware] traveler session refresh fallback', {
      reason: error instanceof Error ? error.message : 'unknown',
      path: req.nextUrl.pathname,
      timeoutMs,
    });
    return NextResponse.next();
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Soft-launch: public_paused guard ─────────────────────────────────────
  // Runs before route-specific logic. Admin/guide/auth routes are exempt.
  // Fails open if getControls() errors (treats public_paused as false).
  const pausedResponse = await applyPublicPausedGuard(req);
  if (pausedResponse) return pausedResponse;

  if (shouldRequireCsrf(req) && !hasValidCsrf(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'CSRF_REQUIRED',
          message: 'CSRF token required',
        },
      },
      { status: 403 }
    );
  }

  // ── Guide routes ───────────────────────────────────────────────────────────
  // 注意：用精確比對，避免 `/guides`（旅客「認識導遊」公開頁）被當成 guide realm
  // 而誤導去 /guide/login。先前 /guides 不在 middleware matcher 內所以無感；本輪把
  // /guides 列表搬進 [locale] 並加入 matcher 後，這個 startsWith 的鬆散比對才暴露。
  const isGuidePage = pathname === '/guide' || pathname.startsWith('/guide/');
  const isGuideApi = pathname.startsWith('/api/guide');

  if (isGuidePage || isGuideApi) {
    const isPublic =
      pathname === '/guide/login' ||
      pathname === '/guide/apply' ||
      pathname.startsWith('/guide/apply/') ||
      pathname === '/guide/new-activity' ||
      pathname.startsWith('/guide/new-activity/') ||
      pathname === '/api/guide/auth/session' ||
      pathname === '/api/guide/auth/csrf';
    if (isPublic) return NextResponse.next();

    if (!verifyGuideSessionMiddleware(req)) {
      if (isGuideApi) {
        return NextResponse.json(
          { ok: false, error: { code: 'UNAUTHORIZED', message: 'guide session required' } },
          { status: 401 },
        );
      }
      const url = req.nextUrl.clone();
      url.pathname = '/guide/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Admin routes ───────────────────────────────────────────────────────────
  const isAdminPage = pathname.startsWith('/admin');
  const isAdminApi = pathname.startsWith('/api/admin') || pathname.startsWith('/api/v2/admin');

  if (isAdminPage || isAdminApi) {
    const isPublicAdminPage = pathname === '/admin/login' || pathname === '/admin/unauthorized';
    const isPublicAdminApi = pathname === '/api/admin/auth/session' || pathname === '/api/admin/auth/csrf';
    if (isPublicAdminPage || isPublicAdminApi) return NextResponse.next();

    if (isAdminPage && !hasAdminCredential(req)) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }

    const security = getAdminSecurityState();
    const hasHeaderToken = !!req.headers.get('x-admin-token');

    // #1567（by-design）：帶 x-admin-token header 的請求跳過 session-version/到期檢查
    // （supply automation/script 呼叫 admin API）。撤銷 header-token 存取的唯一方法是
    // 輪換 ADMIN_ACCESS_TOKEN 本身 —— forceLogoutAllSessions() 只使 cookie session 失效、
    // 對 header 路徑無效。撤銷 SOP 見 docs/operations/credential-rotation-runbook.md Step 3。
    const result = isAdminAuthorized({
      token: pickToken(req),
      email: pickEmail(req),
      expiresAt: req.cookies.get('admin_session_expires_at')?.value || '',
      requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
      allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
      expectedSessionVersion: security.sessionVersion,
      sessionVersion: req.cookies.get('admin_session_version')?.value || 0,
      requireSession: !hasHeaderToken
    });

    if (result.ok) return NextResponse.next();

    if (isAdminApi) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: result.reason || 'admin authorization failed'
          }
        },
        { status: 401 }
      );
    }

    const url = req.nextUrl.clone();
    url.pathname = '/admin/unauthorized';
    url.searchParams.set('reason', result.reason || 'forbidden');
    return NextResponse.rewrite(url);
  }

  // ── Localized public pages → next-intl ──────────────────────────────────────
  // 首頁與 /activities 已搬進 app/[locale]；交給 next-intl 處理 locale rewrite。
  // （soft-launch / CSRF 已在前面跑過；這些路徑非 admin/guide，故不影響三 realm。）
  const restPath = stripLocalePrefix(pathname);
  if (isLocalizedPublicPath(restPath)) {
    // zh-first + sticky（#multilingual）：localeDetection 已於 routing 關閉，新訪客一律
    // 預設繁中、不依瀏覽器語言自動切換。但若使用者曾用切換器選過非預設語言（寫入
    // NEXT_LOCALE cookie），在「未帶前綴」的請求上 sticky redirect 到該語言前綴，維持
    // 站內無前綴連結的語言連續性。已帶前綴（/en…）的請求不在此處理，避免重導迴圈。
    const isUnprefixed = restPath === pathname;
    if (isUnprefixed) {
      const cookieLocale = req.cookies.get('NEXT_LOCALE')?.value;
      if (cookieLocale && (LOCALE_PREFIXES as readonly string[]).includes(cookieLocale)) {
        const url = req.nextUrl.clone();
        url.pathname = pathname === '/' ? `/${cookieLocale}` : `/${cookieLocale}${pathname}`;
        return NextResponse.redirect(url);
      }
    }
    const intlMiddleware = await getIntlMiddleware();
    return intlMiddleware(req);
  }

  // ── Traveler routes ───────────────────────────────────────────────────────
  const isTravelerPublicPath =
    pathname.startsWith('/booking') ||
    pathname.startsWith('/order/success') ||
    pathname.startsWith('/api/activities');

  // Public pages use only static content / no-auth DB reads.
  if (isTravelerPublicPath) return NextResponse.next();

  if (!hasTravelerAuthCookie(req)) return NextResponse.next();

  return refreshTravelerSession(req);
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/v2/admin/:path*',
    '/guide/:path*',
    '/api/guide/:path*',
    // Traveler auth/session refresh only where needed; keep public marketing + activity pages fully cacheable.
    '/me/:path*',
    '/api/me/:path*',
    '/api/reviews',
    '/api/reviews/:path*',
    // Public routes subject to public_paused soft-launch guard (issue #805).
    '/',
    '/activities/:path*',
    '/theme/:path*',
    '/guides',
    '/guides/:slug',
    '/about',
    '/why-choose-us',
    '/faq',
    '/contact',
    '/blog/:path*',
    '/legal/:path*',
    '/experiences/:path*',
    '/booking/:path*',
    '/order/success/:path*',
    '/api/activities/:path*',
    // 多語言（#multilingual Phase 0.5）：locale 前綴的公開頁也要進 middleware。
    '/en',
    '/en/:path*',
    '/ja',
    '/ja/:path*',
    '/ko',
    '/ko/:path*',
  ],
};
