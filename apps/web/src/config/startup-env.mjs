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

function requiredRules(profile) {
  if (profile === 'production' || profile === 'preview') {
    return [
      { key: 'GUIDE_SESSION_SECRET', check: (v) => hasValue(v) && String(v).trim().length >= 32, reason: 'must be >=32 chars', envScope: 'required in preview/production runtime' },
      { key: 'ADMIN_ACCESS_TOKEN', check: (v) => hasValue(v) && String(v).trim().length >= 16, reason: 'must be >=16 chars', envScope: 'required in preview/production runtime' },
      { key: 'SUPABASE_URL', check: (v) => hasValue(v) && isValidUrl(v), reason: 'must be a valid http(s) URL', envScope: 'required in preview/production runtime' },
      { key: 'SUPABASE_SERVICE_ROLE_KEY', check: (v) => hasValue(v), reason: 'cannot be empty', envScope: 'required in preview/production runtime' },
    ];
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

  for (const rule of requiredRules(profile)) {
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
