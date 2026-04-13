import { ok, fail } from '../../../../../../src/lib/api'";
import { listOrderAuditLogsDb } from '../../../../../../src/lib/db.mjs'";

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  try {
    const rows = await listOrderAuditLogsDb({ orderId });
    return Response.json(ok(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('INVALID_REQUEST', message), { status: 400 });
  }
}
