import { ok, fail } from '../../../../../src/lib/api';
import { isAdminAuthorized } from '../../../../../src/lib/admin-auth.mjs';

function parseCookie(req: Request, key: string) {
  const cookie = req.headers.get('cookie') || '';
  const parts = cookie.split(';').map((s) => s.trim());
  const hit = parts.find((p) => p.startsWith(`${key}=`));
  return hit ? decodeURIComponent(hit.slice(key.length + 1)) : '';
}

export async function GET(request: Request) {
  const token = parseCookie(request, 'admin_token');
  const email = parseCookie(request, 'admin_email');
  const expiresAt = parseCookie(request, 'admin_session_expires_at');

  const auth = isAdminAuthorized({
    token,
    email,
    requiredToken: process.env.ADMIN_ACCESS_TOKEN,
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST
  });

  if (!auth.ok) {
    return Response.json(ok({ authorized: false, reason: auth.reason || 'unauthorized' }));
  }

  return Response.json(ok({
    authorized: true,
    email,
    expiresAt: expiresAt || null
  }));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body?.token || '');
  const email = String(body?.email || '');

  const auth = isAdminAuthorized({
    token,
    email,
    requiredToken: process.env.ADMIN_ACCESS_TOKEN,
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST
  });

  if (!auth.ok) {
    return Response.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', `admin_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  headers.append('set-cookie', `admin_email=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  headers.append('set-cookie', `admin_session_expires_at=${encodeURIComponent(expiresAt)}; Path=/; SameSite=Lax; Max-Age=604800`);

  return new Response(JSON.stringify(ok({ created: true, expiresAt })), { status: 200, headers });
}

export async function DELETE() {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', 'admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  headers.append('set-cookie', 'admin_email=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  headers.append('set-cookie', 'admin_session_expires_at=; Path=/; SameSite=Lax; Max-Age=0');
  return new Response(JSON.stringify(ok({ cleared: true })), { status: 200, headers });
}
