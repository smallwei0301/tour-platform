/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/orders）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
import { reportRouteError } from '../../../../../src/lib/route-error';
import { ok, fail } from '../../../../../src/lib/api';
import { listAdminOrdersDb } from '../../../../../src/lib/db.mjs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const contactEmail = url.searchParams.get('contactEmail') || '';
  const sourceChannel = url.searchParams.get('sourceChannel') || '';

  try {
    return Response.json(ok(await listAdminOrdersDb({ status, contactEmail, sourceChannel })));
  } catch (err) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(err, { route: 'v2/admin/orders' });
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
