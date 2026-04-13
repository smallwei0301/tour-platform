import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isAdminAuthorized } from './src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from './src/lib/admin-session.mjs';

function pickToken(req: NextRequest): string {
  return (
    req.headers.get('x-admin-token') ||
    req.cookies.get('admin_token')?.value ||
    req.nextUrl.searchParams.get('admin_token') ||
    ''
  );
}

function pickEmail(req: NextRequest): string {
  return (
    req.headers.get('x-admin-email') ||
    req.cookies.get('admin_email')?.value ||
    req.nextUrl.searchParams.get('admin_email') ||
    ''
  );
}

/**
 * Lightweight guide session check for edge middleware.
 * Verifies format + guideId match. Full HMAC verification happens in API
 * routes via verifyGuideSession() (Node.js crypto, not available in edge).
 * Worst-case attack: forged cookie gets page shell HTML — all API calls
 * will still fail 401 because API routes do HMAC verification.
 */
function verifyGuideSessionMiddleware(req: NextRequest): boolean {
  const rawToken = req.cookies.get('guide_token')?.value || '';
  const guideId = req.cookies.get('guide_id')?.value || '';
  if (!rawToken || !guideId) return false;
  // Expected format: guideId:sessionVersion:hmacSignature
  const parts = rawToken.split(':');
  if (parts.length !== 3) return false;
  const [tokenGuideId, sessionVersion, signature] = parts;
  // Verify guideId matches AND signature is non-empty (basic sanity)
  return tokenGuideId === guideId && !!sessionVersion && signature.length === 64;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Guide routes ───────────────────────────────────────────────────────────
  const isGuidePage = pathname.startsWith('/guide');
  const isGuideApi = pathname.startsWith('/api/guide');

  if (isGuidePage || isGuideApi) {
    // Public guide routes (no auth required)
    const isPublic =
      pathname === '/guide/login' ||
      pathname === '/guide/apply' ||        // public guide application form
      pathname.startsWith('/guide/apply/') ||
      pathname === '/api/guide/auth/session';
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

  // ── Supabase Auth Session Refresh (旅客 Auth) ──────────────────────────────
  // Refresh session cookies so they don't expire during user's visit.
  // Only applies to non-admin, non-guide routes.
  let supabaseResponse = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — required for Server Components to read auth state
  // HOTFIX: avoid hanging the entire request when upstream auth refresh stalls.
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
  } catch {
    // Fail-open for page availability; APIs still enforce their own auth checks.
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/guide/:path*',
    '/api/guide/:path*',
    // Include all other pages for Supabase session refresh (exclude static files)
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
