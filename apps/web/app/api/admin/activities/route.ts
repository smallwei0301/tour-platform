import { ok, fail } from '../../../../src/lib/api'";
import { listAdminActivitiesDb, createActivityDb } from '../../../../src/lib/db.mjs'";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  try {
    return Response.json(ok(await listAdminActivitiesDb({ status })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!body.title) {
    return Response.json(fail('INVALID_REQUEST', 'title is required'), { status: 400 });
  }
  try {
    return Response.json(ok(await createActivityDb(body)), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
