import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server.js';
import type { NextRequest } from 'next/server.js';

import { isAdminAuthorized } from './src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from './src/lib/admin-session.mjs';
import { getControls, isWhitelisted } from './src/lib/soft-launch.mjs';

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
    pathname.startsWith('/api/orders') ||
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
  const isGuidePage = pathname.startsWith('/guide');
  const isGuideApi = pathname.startsWith('/api/guide');

  if (isGuidePage || isGuideApi) {
    const isPublic =
      pathname === '/guide/login' ||
      pathname === '/guide/apply' ||
      pathname.startsWith('/guide/apply/') ||
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

  // ── Traveler routes ───────────────────────────────────────────────────────
  const isTravelerPublicPath =
    pathname.startsWith('/activities') ||
    pathname.startsWith('/booking') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/order/success') ||
    pathname.startsWith('/api/activities') ||
    pathname.startsWith('/api/orders') ||
    pathname === '/';

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
    '/orders/:path*',
    '/api/me/:path*',
    '/api/orders/:path*',
    '/api/reviews',
    '/api/reviews/:path*',
    // Public routes subject to public_paused soft-launch guard (issue #805).
    '/',
    '/activities/:path*',
    '/booking/:path*',
    '/checkout/:path*',
    '/order/success/:path*',
    '/api/activities/:path*',
    '/api/orders/:path*',
  ],
};
