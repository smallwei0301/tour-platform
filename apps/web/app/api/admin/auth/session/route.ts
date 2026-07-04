import { ok, fail } from '../../../../../src/lib/api';
import { isAdminAuthorized } from '../../../../../src/lib/admin-auth.mjs';
import {
  getAdminSecurityState,
  getRequiredAdminToken,
  createAdminSessionCookies,
  clearAdminSessionCookies,
} from '../../../../../src/lib/admin-session.mjs';
import { adminLoginLimiter, RateLimiter, createLoginRateLimitResponse } from '../../../../../src/lib/rate-limit';
import { peekDistributed, recordDistributed } from '../../../../../src/lib/rate-limit-distributed';

// #1599：登入限流的跨實例層。記憶體版（adminLoginLimiter）擋單實例；分散式版（Upstash）
// 在 provision 後擋跨實例稀釋。兩者皆 fail-open；deny 條件為任一層超額。
const LOGIN_RATE_CFG = { maxRequests: 10, windowMs: 60 * 1000 };

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
  const limited =
    createLoginRateLimitResponse(adminLoginLimiter.peek(rateKey))
    ?? createLoginRateLimitResponse(await peekDistributed(rateKey, LOGIN_RATE_CFG));
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
    void recordDistributed(rateKey, LOGIN_RATE_CFG); // 跨實例 best-effort，fail-open
    return Response.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const headers = new Headers({ 'content-type': 'application/json' });
  createAdminSessionCookies({ token, email, expiresAt, sessionVersion: security.sessionVersion })
    .forEach((c) => headers.append('set-cookie', c));

  return new Response(JSON.stringify(ok({ created: true, expiresAt, sessionVersion: security.sessionVersion })), { status: 200, headers });
}

export async function DELETE() {
  const headers = new Headers({ 'content-type': 'application/json' });
  clearAdminSessionCookies().forEach((c) => headers.append('set-cookie', c));
  return new Response(JSON.stringify(ok({ cleared: true })), { status: 200, headers });
}
