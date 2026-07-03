import { ok, fail } from '../../../../../src/lib/api';
import { getKpiConfigDb, updateKpiConfigDb } from '../../../../../src/lib/db-kpi.mjs';

export async function GET() {
  try {
    return Response.json(ok(await getKpiConfigDb()));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(ok(await updateKpiConfigDb({ ...body, actor: body?.actor || 'admin', note: body?.note || '' })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('INVALID_REQUEST', message), { status: 400 });
  }
}
