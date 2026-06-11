import { ok, fail } from '../../../../../src/lib/api';
import { isAdminAuthorized } from '../../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../../src/lib/admin-session.mjs';
import { adminLoginLimiter, RateLimiter, createLoginRateLimitResponse } from '../../../../../src/lib/rate-limit';

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
  const sessionVersion = Number(parseCookie(request, 'admin_session_version') || 0);

  const security = getAdminSecurityState();
  const auth = isAdminAuthorized({
    token,
    email,
    expiresAt,
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion
  });

  if (!auth.ok) {
    return Response.json(ok({ authorized: false, reason: auth.reason || 'unauthorized' }));
  }

  return Response.json(ok({
    authorized: true,
    email,
    expiresAt: expiresAt || null,
    sessionVersion: security.sessionVersion
  }));
}

export async function POST(request: Request) {
  // #1373 — 只計「失敗」嘗試：成功登入不消耗額度，暴力破解在 10 次失敗/分鐘/IP 後被擋
  const rateKey = `admin-login:${RateLimiter.getClientIp(request)}`;
  const limited = createLoginRateLimitResponse(adminLoginLimiter.peek(rateKey));
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const token = String(body?.token || '');
  const email = String(body?.email || '');

  const security = getAdminSecurityState();
  const auth = isAdminAuthorized({
    token,
    email,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion: security.sessionVersion
  });

  if (!auth.ok) {
    adminLoginLimiter.record(rateKey);
    return Response.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', `admin_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  headers.append('set-cookie', `admin_email=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  headers.append('set-cookie', `admin_session_expires_at=${encodeURIComponent(expiresAt)}; Path=/; SameSite=Lax; Max-Age=604800`);
  headers.append('set-cookie', `admin_session_version=${security.sessionVersion}; Path=/; SameSite=Lax; Max-Age=604800`);

  return new Response(JSON.stringify(ok({ created: true, expiresAt, sessionVersion: security.sessionVersion })), { status: 200, headers });
}

export async function DELETE() {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', 'admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  headers.append('set-cookie', 'admin_email=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  headers.append('set-cookie', 'admin_session_expires_at=; Path=/; SameSite=Lax; Max-Age=0');
  headers.append('set-cookie', 'admin_session_version=; Path=/; SameSite=Lax; Max-Age=0');
  return new Response(JSON.stringify(ok({ cleared: true })), { status: 200, headers });
}
