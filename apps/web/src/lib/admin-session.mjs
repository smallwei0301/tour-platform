import { createClient } from '@supabase/supabase-js';

const state = {
  tokenOverride: '',
  sessionVersion: 1,
  rotatedAt: null,
  forcedLogoutAt: null
};

const ADMIN_SECURITY_ROW_ID = 'default';
let hydrateStarted = false;

function isPreviewMode() {
  return String(process.env.VERCEL_ENV || '').toLowerCase() === 'preview';
}

function getAdminSecurityClient() {
  // Avoid blocking preview admin session hydration when preview DB credentials
  // are incomplete or network-restricted.
  if (isPreviewMode()) return null;

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
