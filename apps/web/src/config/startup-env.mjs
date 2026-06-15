const URL_KEYS = ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'];

function hasValue(v) {
  return String(v || '').trim().length > 0;
}

function isValidUrl(v) {
  try {
    const u = new URL(String(v));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function detectProfile(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || '').toLowerCase();
  const vercelEnv = String(env.VERCEL_ENV || '').toLowerCase();
  const nextPhase = String(env.NEXT_PHASE || '');

  if (nodeEnv === 'test') return 'test';
  if (nodeEnv === 'development') return 'development';
  if (nextPhase === 'phase-production-build') return 'build';
  if (vercelEnv === 'preview') return 'preview';
  if (nodeEnv === 'production' || vercelEnv === 'production') return 'production';
  return 'development';
}

function isTruthy(v) {
  const n = String(v || '').trim().toLowerCase();
  return n === '1' || n === 'true' || n === 'yes' || n === 'on';
}

function requiredRules(profile, env = process.env) {
  if (profile === 'production') {
    const rules = [
      { key: 'GUIDE_SESSION_SECRET', check: (v) => hasValue(v) && String(v).trim().length >= 32, reason: 'must be >=32 chars', envScope: 'required in production runtime' },
      { key: 'ADMIN_ACCESS_TOKEN', check: (v) => hasValue(v) && String(v).trim().length >= 16, reason: 'must be >=16 chars', envScope: 'required in production runtime' },
    ];

    // LINE Messaging API secrets are only required once the kill-switch is ON.
    // Keeps the flag-OFF default (incl. CI build) from hard-failing on absent LINE secrets.
    if (isTruthy(env.LINE_MESSAGING_ENABLED)) {
      rules.push(
        { key: 'LINE_CHANNEL_ACCESS_TOKEN', check: (v) => hasValue(v) && String(v).trim().length >= 32, reason: 'must be >=32 chars when LINE_MESSAGING_ENABLED', envScope: 'required when LINE messaging is enabled' },
        { key: 'LINE_CHANNEL_SECRET', check: (v) => hasValue(v) && String(v).trim().length >= 24, reason: 'must be >=24 chars when LINE_MESSAGING_ENABLED', envScope: 'required when LINE messaging is enabled' },
      );
    }

    // LIFF login needs the login channel + LIFF id once the entry flag is ON.
    if (isTruthy(env.NEXT_PUBLIC_LINE_LIFF_ENABLED)) {
      rules.push(
        { key: 'LINE_LOGIN_CHANNEL_ID', check: hasValue, reason: 'required when NEXT_PUBLIC_LINE_LIFF_ENABLED', envScope: 'required when LIFF login is enabled' },
        { key: 'NEXT_PUBLIC_LIFF_ID', check: hasValue, reason: 'required when NEXT_PUBLIC_LINE_LIFF_ENABLED', envScope: 'required when LIFF login is enabled' },
      );
    }

    // Telegram order notifications need the bot token + webhook secret once enabled.
    if (isTruthy(env.TELEGRAM_NOTIFY_ENABLED)) {
      rules.push(
        { key: 'TELEGRAM_BOT_TOKEN', check: hasValue, reason: 'required when TELEGRAM_NOTIFY_ENABLED', envScope: 'required when Telegram notifications are enabled' },
        { key: 'TELEGRAM_WEBHOOK_SECRET', check: (v) => hasValue(v) && String(v).trim().length >= 16, reason: 'must be >=16 chars when TELEGRAM_NOTIFY_ENABLED', envScope: 'required when Telegram notifications are enabled' },
      );
    }

    return rules;
  }

  if (profile === 'preview') {
    // Preview deployments should not hard-fail on runtime secrets at build/startup.
    // Keep preview boot permissive and rely on runtime route-level guards where needed.
    return [];
  }

  return [];
}

export function validateStartupEnv(env = process.env) {
  const profile = detectProfile(env);
  const errors = [];

  for (const key of URL_KEYS) {
    const value = env[key];
    if (!hasValue(value)) continue;
    if (!isValidUrl(value)) {
      errors.push({ key, reason: 'invalid URL format', envScope: 'if provided, must be valid in all environments' });
    }
  }

  for (const rule of requiredRules(profile, env)) {
    const value = env[rule.key];
    if (!rule.check(value)) {
      errors.push({ key: rule.key, reason: rule.reason, envScope: rule.envScope });
    }
  }

  return { ok: errors.length === 0, profile, errors };
}

export function assertStartupEnv(env = process.env) {
  const result = validateStartupEnv(env);
  if (result.ok) return result;

  const detail = result.errors.map((e) => `${e.key}: ${e.reason} (${e.envScope})`).join('; ');
  throw new Error(`[STARTUP_ENV_INVALID] profile=${result.profile}; ${detail}`);
}
