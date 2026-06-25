/**
 * GET /api/guide/bookings/pending-approval — 導遊「待審核」清單
 *
 * request plan 仍為 draft + guide_approval_status='pending' 的 booking。
 * 與既有 /api/guide/bookings（查 orders）分流，避免污染既有列表。
 */
import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { listGuidePendingApprovalsDb } from '../../../../../src/lib/db.mjs';

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  try {
    const result = await listGuidePendingApprovalsDb({ guideId: session.guideId });
    return Response.json(ok(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'server error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
