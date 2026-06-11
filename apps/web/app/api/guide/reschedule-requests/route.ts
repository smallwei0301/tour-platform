/**
 * GET /api/guide/reschedule-requests — 嚮導改期待辦清單（#1383）
 * 讀取時觸發 72h lazy-expire。
 */
import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { listGuideRescheduleRequestsDb } from '../../../../src/lib/db.mjs';
import { rescheduleErrorToResponseParts } from '../../../../src/lib/reschedule.mjs';

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
    const parts = rescheduleErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
