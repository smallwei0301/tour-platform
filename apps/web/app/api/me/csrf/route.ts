import { ok } from '../../../../src/lib/api';
import { createCsrfCookie, createCsrfToken } from '../../../../src/lib/csrf.mjs';

export async function GET() {
  const token = createCsrfToken();
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', createCsrfCookie(token));
  return new Response(JSON.stringify(ok({ csrfToken: token })), { status: 200, headers });
}
