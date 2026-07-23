import { ok } from '../../../../src/lib/api';
import { validateCsrf } from '../../../../src/lib/csrf.mjs';
import { clearGuideSessionCookies } from '../../../../src/lib/guide-auth';
import { clearImpersonationActorCookie } from '../../../../src/lib/midao/impersonation-actor';

export async function DELETE(request: Request) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const headers = new Headers({ 'content-type': 'application/json' });
  clearGuideSessionCookies().forEach((cookie) => headers.append('set-cookie', cookie));
  const actorCookie = clearImpersonationActorCookie();
  headers.append('set-cookie', actorCookie);
  const secure = actorCookie.includes('; Secure') ? '; Secure' : '';
  headers.append(
    'set-cookie',
    `guide_impersonation=; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
  );

  return new Response(JSON.stringify(ok({ deleted: true })), { status: 200, headers });
}
