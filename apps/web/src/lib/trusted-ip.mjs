const FALLBACK_IP = '127.0.0.1';

function firstIpFromHeader(value) {
  if (!value) return '';
  const first = value.split(',')[0]?.trim();
  return first || '';
}

/**
 * Canonical trusted client IP resolver.
 *
 * Trust boundary:
 * - trust platform/proxy controlled headers (cf-connecting-ip, x-real-ip, x-vercel-forwarded-for)
 * - do NOT trust raw x-forwarded-for from clients
 */
export function resolveTrustedClientIp(request) {
  const cfIp = firstIpFromHeader(request.headers.get('cf-connecting-ip'));
  if (cfIp) return { ip: cfIp, source: 'cf-connecting-ip' };

  const realIp = firstIpFromHeader(request.headers.get('x-real-ip'));
  if (realIp) return { ip: realIp, source: 'x-real-ip' };

  const vercelForwarded = firstIpFromHeader(request.headers.get('x-vercel-forwarded-for'));
  if (vercelForwarded) return { ip: vercelForwarded, source: 'x-vercel-forwarded-for' };

  return { ip: FALLBACK_IP, source: 'fallback' };
}

export const TRUSTED_IP_FALLBACK = FALLBACK_IP;
