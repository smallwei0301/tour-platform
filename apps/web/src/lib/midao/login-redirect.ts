const FALLBACK = '/guide/dashboard';
type GuideRealm = 'guide' | 'midao';

function realmOf(pathname: string): GuideRealm | null {
  if (pathname === '/guide' || pathname.startsWith('/guide/')) return 'guide';
  if (pathname === '/midao' || pathname.startsWith('/midao/')) return 'midao';
  return null;
}

function parseSameOriginRelative(value: string): { path: string; realm: GuideRealm } | null {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if (/%(?:2f|5c)/iu.test(value)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.includes('\\') || /%[0-9a-f]{2}/iu.test(decoded)) return null;
  try {
    const base = 'https://guide.local';
    const parsed = new URL(value, base);
    if (parsed.origin !== base || parsed.username || parsed.password) return null;
    const realm = realmOf(parsed.pathname);
    if (!realm) return null;
    return { path: `${parsed.pathname}${parsed.search}${parsed.hash}`, realm };
  } catch {
    return null;
  }
}

export function resolveGuideLoginRedirect(serverRedirect: unknown, requestedNext: string | null): string {
  const server = typeof serverRedirect === 'string' ? parseSameOriginRelative(serverRedirect) : null;
  const authoritative = server ?? { path: FALLBACK, realm: 'guide' as const };
  if (!requestedNext) return authoritative.path;
  const requested = parseSameOriginRelative(requestedNext);
  if (!requested || requested.realm !== authoritative.realm) return authoritative.path;
  return requested.path;
}
