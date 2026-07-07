/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/guide/bookings/pending-approval）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
/**
 * GET /api/guide/bookings/pending-approval — 導遊「待審核」清單
 *
 * request plan 仍為 draft + guide_approval_status='pending' 的 booking。
 * 與既有 /api/guide/bookings（查 orders）分流，避免污染既有列表。
 */
import { reportRouteError } from '../../../../../../src/lib/route-error';
import { ok, fail } from '../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { listGuidePendingApprovalsDb } from '../../../../../../src/lib/db.mjs';

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  try {
    const result = await listGuidePendingApprovalsDb({ guideId: session.guideId });
    return Response.json(ok(result));
  } catch (error) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(error, { route: 'v2/guide/bookings/pending-approval' });
    const message = error instanceof Error ? error.message : 'server error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
