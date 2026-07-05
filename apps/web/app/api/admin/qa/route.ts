import { ok, fail } from '../../../../src/lib/api';
import { isAdminAuthorized, pickAdminCredentials } from '../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../src/lib/admin-session.mjs';
import { normalizeAdminQAStatusFilter } from '../../../../src/lib/admin-qa-status.mjs';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey } from '../../../../src/config/supabase-service-env.mjs';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseServiceRoleKey()!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// AC4: GET /api/admin/qa — list Q&A entries with optional ?status= filter
export async function GET(request: Request) {
  const { token, email, expiresAt, sessionVersion, requireSession } = pickAdminCredentials(request);

  const security = getAdminSecurityState();
  const auth = isAdminAuthorized({
    token,
    email,
    expiresAt,
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion: Number(sessionVersion || 0),
    requireSession,
  });

  if (!auth.ok) {
    return Response.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get('status') || '';
  const status = normalizeAdminQAStatusFilter(rawStatus);

  try {
    const supabase = getServiceClient();
    // Order by created_at DESC (newest first)
    let query = supabase
      .from('activity_qa')
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
