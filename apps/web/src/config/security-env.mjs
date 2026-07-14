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

export function getAdminAuthEnv(env = process.env) {
  return {
    adminAccessToken: env.ADMIN_ACCESS_TOKEN,
    adminEmailAllowlist: env.ADMIN_EMAIL_ALLOWLIST,
  };
}

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

  // Telegram webhook secret must be strong once notifications are enabled (the
  // webhook is a public endpoint; the secret is its only authenticity guard).
  const telegramNotifyOn = ['1', 'true', 'yes', 'on'].includes(
    String(env.TELEGRAM_NOTIFY_ENABLED || '').trim().toLowerCase(),
  );
  if (telegramNotifyOn && isWeakSecret(env.TELEGRAM_WEBHOOK_SECRET, 16)) {
    violations.push('TELEGRAM_WEBHOOK_SECRET missing/weak/default (>=16 chars required when TELEGRAM_NOTIFY_ENABLED)');
  }

  if (violations.length) {
    throw new Error(`[SECURITY_ENV_BLOCK] ${violations.join('; ')}`);
  }

  return true;
}
