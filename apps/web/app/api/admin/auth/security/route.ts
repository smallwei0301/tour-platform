import { ok, fail } from '../../../../../src/lib/api'";
import { getAdminSecurityState, rotateAdminToken } from '../../../../../src/lib/admin-session.mjs'";

export async function GET() {
  try {
    const s = getAdminSecurityState();
    return Response.json(ok({
      sessionVersion: s.sessionVersion,
      rotatedAt: s.rotatedAt,
      forcedLogoutAt: s.forcedLogoutAt,
      hasTokenOverride: !!s.tokenOverride
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const s = rotateAdminToken({
      currentToken: body?.currentToken,
      newToken: body?.newToken,
      envToken: process.env.ADMIN_ACCESS_TOKEN
    });
    return Response.json(ok({
      sessionVersion: s.sessionVersion,
      rotatedAt: s.rotatedAt,
      forcedLogoutAt: s.forcedLogoutAt,
      hasTokenOverride: !!s.tokenOverride
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('INVALID_REQUEST', message), { status: 400 });
  }
}
