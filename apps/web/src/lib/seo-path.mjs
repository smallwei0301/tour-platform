/**
 * Builds a public route path from trusted static segments and encoded dynamic
 * segments. Dynamic values must never be interpolated directly into metadata
 * URLs because `?`, `#`, `/`, and whitespace otherwise change URL semantics.
 */
export function buildPublicPath(basePath, segments = []) {
  const normalizedBase = `/${String(basePath).replace(/^\/+|\/+$/g, '')}`;
  const encodedSegments = segments.map((segment) => encodeURIComponent(String(segment)));
  return encodedSegments.length > 0
    ? `${normalizedBase}/${encodedSegments.join('/')}`
    : normalizedBase;
}
