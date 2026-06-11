import { createClient } from '@supabase/supabase-js';

const state = {
  tokenOverride: '',
  sessionVersion: 1,
  rotatedAt: null,
  forcedLogoutAt: null
};

const ADMIN_SECURITY_ROW_ID = 'default';
let hydrateStarted = false;

function getAdminSecurityClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function hydrateStateFromDb() {
  const supabase = getAdminSecurityClient();
  if (!supabase) return;

  const { data, error } = await supabase
    .from('admin_security')
    .select('token_override, session_version, rotated_at, forced_logout_at')
    .eq('id', ADMIN_SECURITY_ROW_ID)
    .maybeSingle();

  if (error || !data) return;

  state.tokenOverride = data.token_override || '';
  state.sessionVersion = Number(data.session_version || 1);
  state.rotatedAt = data.rotated_at || null;
  state.forcedLogoutAt = data.forced_logout_at || null;
}

function hydrateStateFromDbBestEffort() {
  if (hydrateStarted) return;
  hydrateStarted = true;
  hydrateStateFromDb().catch(() => {
    // best-effort only; keep in-memory behavior as fallback
  });
}

function persistStateBestEffort() {
  const supabase = getAdminSecurityClient();
  if (!supabase) return;

  const payload = {
    id: ADMIN_SECURITY_ROW_ID,
    token_override: state.tokenOverride || null,
    session_version: state.sessionVersion,
    rotated_at: state.rotatedAt,
    forced_logout_at: state.forcedLogoutAt,
    updated_at: new Date().toISOString(),
  };

  supabase.from('admin_security').upsert(payload).then(() => {
    // no-op
  }).catch(() => {
    // best-effort only; keep in-memory behavior as fallback
  });
}

// Kick off one-time async hydration on module load.
hydrateStateFromDbBestEffort();

const ADMIN_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// #1374 — production 一律帶 Secure（比照 guide-auth.ts pattern），dev http 不強制
function adminCookieSecurePart() {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

export function createAdminSessionCookies({ token, email, expiresAt, sessionVersion }) {
  const securePart = adminCookieSecurePart();
  const base = `; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}${securePart}`;
  // expires_at / session_version are read by client JS for UI display only (not HttpOnly)
  const publicBase = `; Path=/; SameSite=Lax; Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}${securePart}`;
  return [
    `admin_token=${encodeURIComponent(token)}${base}`,
    `admin_email=${encodeURIComponent(email)}${base}`,
    `admin_session_expires_at=${encodeURIComponent(expiresAt)}${publicBase}`,
    `admin_session_version=${sessionVersion}${publicBase}`,
  ];
}

export function clearAdminSessionCookies() {
  const securePart = adminCookieSecurePart();
  const expire = `; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${securePart}`;
  const publicExpire = `; Path=/; SameSite=Lax; Max-Age=0${securePart}`;
  return [
    `admin_token=${expire}`,
    `admin_email=${expire}`,
    `admin_session_expires_at=${publicExpire}`,
    `admin_session_version=${publicExpire}`,
  ];
}

export function getAdminSecurityState() {
  hydrateStateFromDbBestEffort();
  return { ...state };
}

export function getRequiredAdminToken(envToken) {
  return state.tokenOverride || String(envToken || '');
}

export function rotateAdminToken(input = {}) {
  const currentToken = String(input.currentToken || '');
  const newToken = String(input.newToken || '');
  const envToken = String(input.envToken || '');

  if (!newToken || newToken.length < 8) throw new Error('newToken too short');

  const required = state.tokenOverride || envToken;
  if (!required) throw new Error('base token missing');
  if (currentToken !== required) throw new Error('currentToken mismatch');

  state.tokenOverride = newToken;
  state.sessionVersion += 1;
  state.rotatedAt = new Date().toISOString();
  state.forcedLogoutAt = state.rotatedAt;
  persistStateBestEffort();

  return getAdminSecurityState();
}

export function forceLogoutAllSessions() {
  state.sessionVersion += 1;
  state.forcedLogoutAt = new Date().toISOString();
  persistStateBestEffort();
  return getAdminSecurityState();
}
