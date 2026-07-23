import { ok } from '../../../../src/lib/api';
import { validateCsrf } from '../../../../src/lib/csrf.mjs';
import { clearGuideSessionCookies } from '../../../../src/lib/guide-auth';
import { clearImpersonationActorCookie } from '../../../../src/lib/midao/impersonation-actor';
import { verifyCanonicalGuideSession } from '../../../../src/lib/midao/canonical-guide-session';

export async function GET(request: Request) {
  try {
    // Status is shared by legacy and Midao realms; feature-mode gating is irrelevant here,
    // while guide HMAC, DB version/status and signed actor target remain mandatory.
    const session = await verifyCanonicalGuideSession(request, {
      requireMode: false,
      flags: { backendEnabled: true },
    });
    return Response.json(ok({
      active: session.actorType === 'admin',
      guideName: session.guideName,
    }));
  } catch {
    return Response.json(ok({ active: false }));
  }
}

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
