/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/refund-requests/[refundRequestId]/reject）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
import { reportRouteError, getErrorText, pickSafeMessage, ORDER_DOMAIN_ERROR_PATTERNS } from '../../../../../../../src/lib/route-error';
import { ok, fail } from '../../../../../../../src/lib/api';
import { updateAdminRefundStatusDb } from '../../../../../../../src/lib/db.mjs';

export async function POST(request: Request, context: { params: Promise<{ refundRequestId: string }> }) {
  const { refundRequestId } = await context.params;
  const body = await request.json().catch(() => ({}));

  try {
    const row = await updateAdminRefundStatusDb({ refundRequestId, action: 'reject', adminNote: body?.adminNote });
    return Response.json(ok(row));
  } catch (err) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(err, { route: 'v2/admin/refund-requests/[refundRequestId]/reject' });
    // #1925：狀態仍由原始訊息分類；回給 client 的文案只允許我方定義的業務訊息，其餘（DB 錯誤）一律通用文案。
    const status = getErrorText(err).includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', pickSafeMessage(err, ORDER_DOMAIN_ERROR_PATTERNS)), { status });
  }
}
