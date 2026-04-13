import { ok, fail } from '../../../../../../src/lib/api';
import { revertKpiConfigDb } from '../../../../../../src/lib/db.mjs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(ok(await revertKpiConfigDb({ versionId: body?.versionId, actor: body?.actor || 'admin' })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
