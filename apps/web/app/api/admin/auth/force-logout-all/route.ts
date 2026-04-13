import { ok, fail } from '../../../../../src/lib/api'";
import { forceLogoutAllSessions, getAdminSecurityState } from '../../../../../src/lib/admin-session.mjs'";

export async function POST() {
  try {
    const s = forceLogoutAllSessions();
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append('set-cookie', 'admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    headers.append('set-cookie', 'admin_email=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    headers.append('set-cookie', 'admin_session_expires_at=; Path=/; SameSite=Lax; Max-Age=0');
    headers.append('set-cookie', 'admin_session_version=; Path=/; SameSite=Lax; Max-Age=0');
    return new Response(JSON.stringify(ok({ sessionVersion: s.sessionVersion, forcedLogoutAt: s.forcedLogoutAt })), { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function GET() {
  const s = getAdminSecurityState();
  return Response.json(ok({ sessionVersion: s.sessionVersion, forcedLogoutAt: s.forcedLogoutAt }));
}
