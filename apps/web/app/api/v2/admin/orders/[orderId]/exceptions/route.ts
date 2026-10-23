/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/orders/[orderId]/exceptions）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
import { reportRouteError, getErrorText, pickSafeMessage, ORDER_DOMAIN_ERROR_PATTERNS } from '../../../../../../../src/lib/route-error';
import { ok, fail } from '../../../../../../../src/lib/api';
import { applyAdminOrderExceptionDb } from '../../../../../../../src/lib/db.mjs';

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = await request.json().catch(() => ({}));

  try {
    const result = await applyAdminOrderExceptionDb({
      orderId,
      action: body?.action,
      targetScheduleId: body?.targetScheduleId,
      newCapacity: body?.newCapacity,
      adminNote: body?.adminNote
    });
    return Response.json(ok(result));
  } catch (err) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(err, { route: 'v2/admin/orders/[orderId]/exceptions' });
    // #1925：狀態由原始訊息分類；client 文案只允許我方業務訊息。
    const status = getErrorText(err).includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', pickSafeMessage(err, ORDER_DOMAIN_ERROR_PATTERNS)), { status });
  }
}
