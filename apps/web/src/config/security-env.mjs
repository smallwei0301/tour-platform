// Known weak / placeholder values that must never be used in production for
// GUIDE_SESSION_SECRET / ADMIN_ACCESS_TOKEN. The length check in isWeakSecret
// (>=32 for guide secret, >=16 for admin token) already blocks short literals;
// this list catches longer-looking-but-still-weak placeholders. Do not add
// real values here — even rotated ones become identifying once a string is
// committed to git history.
const WEAK_TOKEN_VALUES = new Set([
  'test-token-123',
  'guide-dev-secret-change-in-prod',
  'changeme',
  'default',
  'admin',
  'password',
]);

function isWeakSecret(value, minLen = 24) {
  const v = String(value || '').trim();
  if (!v) return true;
  if (v.length < minLen) return true;
  if (WEAK_TOKEN_VALUES.has(v)) return true;
  if (/^your[-_]/i.test(v)) return true;
  return false;
}

export function assertRuntimeSecretPolicy(env = process.env) {
  const isProd = String(env.NODE_ENV || '').toLowerCase() === 'production';
  if (!isProd) return true;

  const violations = [];

  const guideSecret = env.GUIDE_SESSION_SECRET;
  if (isWeakSecret(guideSecret, 32)) {
    violations.push('GUIDE_SESSION_SECRET missing/weak/default (production requires >=32 chars)');
  }

  const adminToken = env.ADMIN_ACCESS_TOKEN;
  if (isWeakSecret(adminToken, 16)) {
    violations.push('ADMIN_ACCESS_TOKEN missing/weak/default (production requires >=16 chars)');
  }

  if (violations.length) {
    throw new Error(`[SECURITY_ENV_BLOCK] ${violations.join('; ')}`);
  }

  return true;
}
