export const CSRF_COOKIE_NAME = 'tp_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

function isMutationMethod(method) {
  const m = String(method || '').toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

function parseCookieHeader(cookieHeader = '') {
  return String(cookieHeader)
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const [k, ...rest] = pair.split('=');
      if (!k) return acc;
      acc[k] = decodeURIComponent(rest.join('='));
      return acc;
    }, {});
}

export function hasValidCsrf({ cookieHeader = '', csrfHeader = '' } = {}) {
  const cookies = parseCookieHeader(cookieHeader);
  const cookieToken = String(cookies[CSRF_COOKIE_NAME] || '');
  const headerToken = String(csrfHeader || '');
  return !!cookieToken && !!headerToken && cookieToken === headerToken;
}

export function shouldRequireScopedCsrf({
  pathname = '',
  method = 'GET',
  cookieHeader = '',
  hasTravelerAuthCookie = false,
} = {}) {
  if (!isMutationMethod(method)) return false;

  const path = String(pathname || '');
  if (!(path.startsWith('/api/admin/') || path.startsWith('/api/guide/') || path.startsWith('/api/me/'))) {
    return false;
  }

  // Token issuance + non-session admin login are exempt.
  if (path === '/api/guide/auth/csrf' || path === '/api/admin/auth/csrf' || path === '/api/me/csrf') return false;
  if (path === '/api/admin/auth/session' && String(method).toUpperCase() === 'POST') return false;

  const cookies = parseCookieHeader(cookieHeader);
  if (path.startsWith('/api/admin/')) return !!cookies.admin_token;
  if (path.startsWith('/api/guide/')) return !!cookies.guide_token;
  if (path.startsWith('/api/me/')) return !!hasTravelerAuthCookie;

  return false;
}
