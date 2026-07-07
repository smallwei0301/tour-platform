/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/orders/[orderId]/audit-logs）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
import { reportRouteError } from '../../../../../../../src/lib/route-error';
import { ok, fail } from '../../../../../../../src/lib/api';
import { listOrderAuditLogsDb } from '../../../../../../../src/lib/db.mjs';

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  try {
    const rows = await listOrderAuditLogsDb({ orderId });
    return Response.json(ok(rows));
  } catch (err) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(err, { route: 'v2/admin/orders/[orderId]/audit-logs' });
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('INVALID_REQUEST', message), { status: 400 });
  }
}
