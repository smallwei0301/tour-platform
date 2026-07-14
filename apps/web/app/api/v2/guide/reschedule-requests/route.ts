/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/guide/reschedule-requests）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
/**
 * GET /api/guide/reschedule-requests — 嚮導改期待辦清單（#1383）
 * 讀取時觸發 72h lazy-expire。
 */
import { reportRouteError } from '../../../../../src/lib/route-error';
import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { listGuideRescheduleRequestsDb } from '../../../../../src/lib/db.mjs';
import { rescheduleErrorToResponseParts } from '../../../../../src/lib/reschedule.mjs';

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  try {
    const rows = await listGuideRescheduleRequestsDb({
      guideId: session.guideId,
      guideSlug: session.guideId,
    });
    return Response.json(ok(rows));
  } catch (error) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(error, { route: 'v2/guide/reschedule-requests' });
    const parts = rescheduleErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
