/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/refund-requests）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
import { reportRouteError, GENERIC_SERVER_ERROR_MESSAGE } from '../../../../../src/lib/route-error';
import { ok, fail } from '../../../../../src/lib/api';
import { listAdminRefundRequestsDb } from '../../../../../src/lib/db.mjs';

export async function GET() {
  try {
    return Response.json(ok(await listAdminRefundRequestsDb()));
  } catch (err) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(err, { route: 'v2/admin/refund-requests' });
    // #1925：不把 DB 錯誤字串回給 client。
    return Response.json(fail('SERVER_ERROR', GENERIC_SERVER_ERROR_MESSAGE), { status: 500 });
  }
}
