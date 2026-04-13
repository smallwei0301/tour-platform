import { ok, fail } from '../../../../../src/lib/api';
import { operationsTrackingSummaryDb } from '../../../../../src/lib/db.mjs';

export async function GET() {
  try {
    return Response.json(ok(await operationsTrackingSummaryDb()));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
