import { randomBytes, timingSafeEqual } from 'crypto';

export const CSRF_COOKIE_NAME = 'tp_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, item) => {
    const [rawKey, ...rest] = item.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

export function createCsrfToken() {
  return randomBytes(32).toString('hex');
}

export function createCsrfCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=86400; SameSite=Lax${secure}`;
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function validateCsrf(request) {
  const cookieMap = parseCookieHeader(request.headers.get('cookie'));
  const cookieToken = cookieMap[CSRF_COOKIE_NAME] || '';
  const headerToken = request.headers.get(CSRF_HEADER_NAME) || '';

  if (!cookieToken || !headerToken) {
    return Response.json(
      { ok: false, error: { code: 'CSRF_REQUIRED', message: 'CSRF token required' } },
      { status: 403 }
    );
  }

  if (!safeEqual(cookieToken, headerToken)) {
    return Response.json(
      { ok: false, error: { code: 'CSRF_INVALID', message: 'Invalid CSRF token' } },
      { status: 403 }
    );
  }

  return null;
}
