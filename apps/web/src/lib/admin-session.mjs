const state = {
  tokenOverride: '',
  sessionVersion: 1,
  rotatedAt: null,
  forcedLogoutAt: null
};

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

  return getAdminSecurityState();
}

export function forceLogoutAllSessions() {
  state.sessionVersion += 1;
  state.forcedLogoutAt = new Date().toISOString();
  return getAdminSecurityState();
}
