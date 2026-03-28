import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAdminAuthorized } from './src/lib/admin-auth.mjs';

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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminPage = pathname.startsWith('/admin');
  const isAdminApi = pathname.startsWith('/api/admin');

  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  const result = isAdminAuthorized({
    token: pickToken(req),
    email: pickEmail(req),
    requiredToken: process.env.ADMIN_ACCESS_TOKEN,
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST
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

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*']
};
