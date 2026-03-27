import { ok, fail } from '../../../../src/lib/api';
import { listAdminOrdersFallback } from '../../../../src/lib/admin.mjs';

export async function GET() {
  try {
    return Response.json(ok(listAdminOrdersFallback()));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
