import { NextResponse } from 'next/server';
import { isAdminAuthorized } from '../../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../../src/lib/admin-session.mjs';

function pickCookieVal(cookieHeader: string, key: string): string {
  return cookieHeader.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`))?.[1]?.trim() || '';
}

function pickToken(req: Request): string {
  const cookie = req.headers.get('cookie') || '';
  return req.headers.get('x-admin-token') || pickCookieVal(cookie, 'admin_token');
}

function pickEmail(req: Request): string {
  const cookie = req.headers.get('cookie') || '';
  return req.headers.get('x-admin-email') || decodeURIComponent(pickCookieVal(cookie, 'admin_email'));
}

function pickSessionVersion(req: Request): string {
  const cookie = req.headers.get('cookie') || '';
  return pickCookieVal(cookie, 'admin_session_version') || '0';
}

export async function GET(req: Request) {
  const security = await getAdminSecurityState();
  const result = isAdminAuthorized({
    token: pickToken(req),
    email: pickEmail(req),
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion: pickSessionVersion(req),
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: result.reason } },
      { status: 401 }
    );
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from('guide_profiles')
      .select('id, display_name, slug, verification_status, headline, region, rating_avg, review_count')
      .eq('verification_status', 'approved')
      .order('display_name');

    if (error) throw error;

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (err: unknown) {
    console.error('[admin/guides/approved] error:', err);
    const msg = err instanceof Error ? err.message : 'SERVER_ERROR';
    return NextResponse.json({ ok: false, error: { code: 'SERVER_ERROR', message: msg } }, { status: 500 });
  }
}
