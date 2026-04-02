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

  const expectedSessionVersion = Number(input.expectedSessionVersion || 1);
  const sessionVersion = Number(input.sessionVersion || 0);

  if (!requiredToken) return { ok: false, reason: 'ADMIN_ACCESS_TOKEN not configured' };
  if (!token || token !== requiredToken) return { ok: false, reason: 'invalid token' };

  if (sessionVersion !== expectedSessionVersion) {
    return { ok: false, reason: 'session expired' };
  }

  if (allowlist.length > 0) {
    if (!email) return { ok: false, reason: 'email required' };
    if (!allowlist.includes(email)) return { ok: false, reason: 'email not allowlisted' };
  }

  return { ok: true };
}
