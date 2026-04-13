import { ok, fail } from '../../../../src/lib/api'";
import { listAdminOrdersDb } from '../../../../src/lib/db.mjs'";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const contactEmail = url.searchParams.get('contactEmail') || '';

  try {
    return Response.json(ok(await listAdminOrdersDb({ status, contactEmail })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
