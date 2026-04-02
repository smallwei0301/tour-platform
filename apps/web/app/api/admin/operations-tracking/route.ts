import { ok, fail } from '../../../../src/lib/api';
import { listOperationsTrackingDb, updateOperationsTrackingDb } from '../../../../src/lib/db.mjs';

export async function GET() {
  try {
    return Response.json(ok(await listOperationsTrackingDb()));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(ok(await updateOperationsTrackingDb(body)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('required') ? 400 : 500;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
