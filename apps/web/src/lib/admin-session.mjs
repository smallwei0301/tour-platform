const state = {
  tokenOverride: '',
  sessionVersion: 1,
  rotatedAt: null,
  forcedLogoutAt: null
};

// Try to persist admin security state to Supabase when available.
// Load existing persisted state asynchronously on module init (best-effort).
(async () => {
  try {
    const { hasSupabaseEnv, getSupabase } = await import('./db.mjs');
    if (hasSupabaseEnv()) {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from('admin_security').select('id, token_override, session_version, rotated_at, forced_logout_at').eq('id', 'default').maybeSingle();
      if (!error && data) {
        state.tokenOverride = data.token_override || state.tokenOverride;
        state.sessionVersion = Number(data.session_version || state.sessionVersion);
        state.rotatedAt = data.rotated_at || state.rotatedAt;
        state.forcedLogoutAt = data.forced_logout_at || state.forcedLogoutAt;
      }
    }
  } catch (e) {
    // best-effort only; do not throw on load failures
    console.warn('[admin-session] failed to load persisted state:', e?.message || e);
  }
})();

function persistStateBestEffort() {
  // fire-and-forget async persist
  (async () => {
    try {
      const { hasSupabaseEnv, getSupabase } = await import('./db.mjs');
      if (!hasSupabaseEnv()) return;
      const supabase = await getSupabase();
      const payload = {
        id: 'default',
        token_override: state.tokenOverride || null,
        session_version: state.sessionVersion,
        rotated_at: state.rotatedAt || null,
        forced_logout_at: state.forcedLogoutAt || null,
        updated_at: new Date().toISOString()
      };
      const { error } = await supabase.from('admin_security').upsert(payload);
      if (error) console.warn('[admin-session] persist error:', error.message);
    } catch (e) {
      console.warn('[admin-session] persist exception:', e?.message || e);
    }
  })();
}

export function getAdminSecurityState() {
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
