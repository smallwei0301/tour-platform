import { ok, fail } from '../../../../../src/lib/api';
import { isAdminAuthorized } from '../../../../../src/lib/admin-auth.mjs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body?.token || '');
  const email = String(body?.email || '');

  const auth = isAdminAuthorized({
    token,
    email,
    requiredToken: process.env.ADMIN_ACCESS_TOKEN,
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST
  });

  if (!auth.ok) {
    return Response.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', `admin_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  headers.append('set-cookie', `admin_email=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);

  return new Response(JSON.stringify(ok({ created: true })), { status: 200, headers });
}

export async function DELETE() {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', 'admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  headers.append('set-cookie', 'admin_email=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return new Response(JSON.stringify(ok({ cleared: true })), { status: 200, headers });
}
