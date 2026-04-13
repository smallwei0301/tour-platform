import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

  // ── Global production timeout mitigation for dynamic slug pages ───────────
  // Some dynamic routes are intermittently stalling in production.
  // Redirect to stable pages as a temporary fail-safe.
  const activityMatch = pathname.match(/^\/activities\/[^/]+\/([^/]+)$/);
  if (activityMatch) {
    const url = req.nextUrl.clone();
    url.pathname = '/checkout';
    url.searchParams.set('slug', decodeURIComponent(activityMatch[1] || ''));
    return NextResponse.redirect(url);
  }

  const bookingMatch = pathname.match(/^\/booking\/([^/]+)$/);
  if (bookingMatch) {
    const url = req.nextUrl.clone();
    url.pathname = '/checkout';
    url.searchParams.set('slug', decodeURIComponent(bookingMatch[1] || ''));
    return NextResponse.redirect(url);
  }

  if (/^\/blog\/[^/]+$/.test(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/blog';
    return NextResponse.redirect(url);
  }

  if (/^\/experiences\/[^/]+$/.test(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/activities';
    return NextResponse.redirect(url);
  }

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

  // ── Traveler routes ───────────────────────────────────────────────────────
  // HOTFIX: temporarily skip Supabase session refresh in middleware.
  // Root cause under investigation: refresh occasionally stalls and blocks
  // dynamic page responses in production.
  return NextResponse.next();
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
