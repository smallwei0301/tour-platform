import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAdminAuthorized } from './src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from './src/lib/admin-session.mjs';
import { hasValidCsrf, shouldRequireScopedCsrf } from './src/lib/csrf-scope.mjs';

function pickToken(req: NextRequest): string {
  // Security: never read admin credentials from URL query params.
  return req.headers.get('x-admin-token') || req.cookies.get('admin_token')?.value || '';
}

function pickEmail(req: NextRequest): string {
  // Security: never read admin credentials from URL query params.
  return req.headers.get('x-admin-email') || req.cookies.get('admin_email')?.value || '';
}

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

  if (
    shouldRequireScopedCsrf({
      pathname,
      method: req.method,
      cookieHeader: req.headers.get('cookie') || '',
      hasTravelerAuthCookie: hasTravelerAuthCookie(req),
    }) &&
    !hasValidCsrf({
      cookieHeader: req.headers.get('cookie') || '',
      csrfHeader: req.headers.get('x-csrf-token') || '',
    })
  ) {
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
  const isAdminApi = pathname.startsWith('/api/admin');

  if (isAdminPage || isAdminApi) {
    const isPublicAdminPage = pathname === '/admin/login' || pathname === '/admin/unauthorized';
    const isPublicAdminApi = pathname === '/api/admin/auth/session';
    if (isPublicAdminPage || isPublicAdminApi) return NextResponse.next();

    const security = getAdminSecurityState();

    const result = isAdminAuthorized({
      token: pickToken(req),
      email: pickEmail(req),
      requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
      allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
      expectedSessionVersion: security.sessionVersion,
      sessionVersion: req.cookies.get('admin_session_version')?.value || req.nextUrl.searchParams.get('admin_session_version') || 0
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
    '/guide/:path*',
    '/api/guide/:path*',
    // Traveler auth/session refresh only where needed; keep public marketing + activity pages fully cacheable.
    '/me/:path*',
    '/orders/:path*',
    '/api/me/:path*',
    '/api/orders/:path*',
  ],
};
