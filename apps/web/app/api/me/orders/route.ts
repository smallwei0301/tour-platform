import { ok, fail } from '../../../../src/lib/api';
import { listMyOrdersDb } from '../../../../src/lib/db.mjs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contactEmail = url.searchParams.get('contactEmail') || '';

  try {
    const rows = await listMyOrdersDb({ contactEmail });
    return Response.json(ok(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
