const WEAK_TOKEN_VALUES = new Set([
  'test-token-123',
  'guide-dev-secret-change-in-prod',
  '@Wei3362499',
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

  // LINE Messaging secrets are only enforced once the kill-switch is ON, so the
  // flag-OFF default (incl. CI build) is unaffected.
  const lineMessagingOn = ['1', 'true', 'yes', 'on'].includes(
    String(env.LINE_MESSAGING_ENABLED || '').trim().toLowerCase(),
  );
  if (lineMessagingOn) {
    if (isWeakSecret(env.LINE_CHANNEL_ACCESS_TOKEN, 32)) {
      violations.push('LINE_CHANNEL_ACCESS_TOKEN missing/weak/default (>=32 chars required when LINE_MESSAGING_ENABLED)');
    }
    if (isWeakSecret(env.LINE_CHANNEL_SECRET, 24)) {
      violations.push('LINE_CHANNEL_SECRET missing/weak/default (>=24 chars required when LINE_MESSAGING_ENABLED)');
    }
  }

  if (violations.length) {
    throw new Error(`[SECURITY_ENV_BLOCK] ${violations.join('; ')}`);
  }

  return true;
}
