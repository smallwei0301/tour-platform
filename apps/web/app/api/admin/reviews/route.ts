import { ok, fail } from '../../../../src/lib/api';
import { isAdminAuthorized } from '../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../src/lib/admin-session.mjs';
import { createClient } from '@supabase/supabase-js';

function parseCookie(req: Request, key: string) {
  const cookie = req.headers.get('cookie') || '';
  const parts = cookie.split(';').map((s) => s.trim());
  const hit = parts.find((p) => p.startsWith(`${key}=`));
  return hit ? decodeURIComponent(hit.slice(key.length + 1)) : '';
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// AC4: GET /api/admin/reviews — list reviews with optional ?status= filter
export async function GET(request: Request) {
  const token = parseCookie(request, 'admin_token');
  const email = parseCookie(request, 'admin_email');
  const expiresAt = parseCookie(request, 'admin_session_expires_at');
  const sessionVersion = Number(parseCookie(request, 'admin_session_version') || 0);

  const security = getAdminSecurityState();
  const auth = isAdminAuthorized({
    token,
    email,
    expiresAt,
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion,
  });

  if (!auth.ok) {
    return Response.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';

  try {
    const supabase = getServiceClient();
    // Order by created_at DESC (newest first)
    let query = supabase
      .from('activity_reviews')
      .select('*')
      .order('created_at', { ascending: false }); // DESC

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return Response.json(fail('DB_ERROR', error.message), { status: 500 });
    }

    return Response.json(ok(data ?? []));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
