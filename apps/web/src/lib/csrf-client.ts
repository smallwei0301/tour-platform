export const CSRF_COOKIE_NAME = 'tp_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export function readCsrfTokenFromCookie(): string {
  if (typeof document === 'undefined') return '';
  const cookies = document.cookie.split(';').map((c) => c.trim());
  const match = cookies.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
  if (!match) return '';
  return decodeURIComponent(match.slice(CSRF_COOKIE_NAME.length + 1));
}

export function csrfHeaders(base: Record<string, string> = {}): Record<string, string> {
  const token = readCsrfTokenFromCookie();
  return token ? { ...base, [CSRF_HEADER_NAME]: token } : base;
}

export async function ensureCsrfToken(): Promise<string> {
  const existing = readCsrfTokenFromCookie();
  if (existing) return existing;

  try {
    await fetch('/api/me/csrf', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return '';
  }

  return readCsrfTokenFromCookie();
}
