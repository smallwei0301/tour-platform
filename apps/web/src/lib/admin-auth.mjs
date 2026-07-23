import { constantTimeEquals } from './constant-time.mjs';

export function parseAllowlist(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminAuthorized(input = {}) {
  const token = String(input.token || '');
  const email = String(input.email || '').toLowerCase();
  const requiredToken = String(input.requiredToken || '');
  const allowlist = parseAllowlist(input.allowlistRaw);
  const requireSession = input.requireSession !== false;

  const expectedSessionVersion = Number(input.expectedSessionVersion || 1);
  const sessionVersion = Number(input.sessionVersion || 0);
  const expiresAtRaw = String(input.expiresAt || '').trim();

  if (!requiredToken) return { ok: false, reason: 'ADMIN_ACCESS_TOKEN not configured' };
  // 常數時間比較，避免 timing side-channel（健檢 v2 S2）
  if (!token || !constantTimeEquals(token, requiredToken)) return { ok: false, reason: 'invalid token' };

  if (requireSession) {
    if (sessionVersion !== expectedSessionVersion) {
      return { ok: false, reason: 'session expired' };
    }

    if (!expiresAtRaw) {
      return { ok: false, reason: 'session expired' };
    }

    const expiresAtMs = Date.parse(expiresAtRaw);
    if (!Number.isFinite(expiresAtMs)) {
      return { ok: false, reason: 'session expired' };
    }

    if (expiresAtMs <= Date.now()) {
      return { ok: false, reason: 'session expired' };
    }
  }

  if (allowlist.length > 0) {
    if (!email) return { ok: false, reason: 'email required' };
    if (!allowlist.includes(email)) return { ok: false, reason: 'email not allowlisted' };
  }

  return { ok: true };
}

/**
 * Read admin credentials from header (x-admin-token / x-admin-email) or cookie.
 * Returns the same shape as parseCookie-based calls but prefers header auth.
 */
export function pickAdminCredentials(req) {
  function parseCookieLocal(key) {
    const cookie = req.headers.get('cookie') || '';
    const parts = cookie.split(';').map((s) => s.trim());
    const hit = parts.find((p) => p.startsWith(`${key}=`));
    return hit ? decodeURIComponent(hit.slice(key.length + 1)) : '';
  }

  // Keep this resolver exactly aligned with middleware pickToken/pickEmail:
  // each header independently overrides its corresponding cookie. A header
  // token alone selects the non-session automation realm.
  const headerToken = req.headers.get('x-admin-token') || '';
  const token = headerToken || parseCookieLocal('admin_token');
  const email = req.headers.get('x-admin-email') || parseCookieLocal('admin_email');
  const sessionVersion = headerToken ? null : parseCookieLocal('admin_session_version');
  const expiresAt = headerToken ? null : parseCookieLocal('admin_session_expires_at');
  return { token, email, sessionVersion, expiresAt, requireSession: !headerToken };
}
