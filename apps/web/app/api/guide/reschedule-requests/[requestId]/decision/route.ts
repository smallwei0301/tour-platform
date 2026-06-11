/**
 * POST /api/guide/reschedule-requests/[requestId]/decision — 嚮導核可/拒絕（#1383）
 * approve 的原子性由 fn_reschedule_booking_atomic RPC（Supabase）/ 單執行緒
 * fallback 保證；嚮導只能處理自己活動的申請（以清單成員資格驗證）。
 */
import { ok, fail } from '../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { listGuideRescheduleRequestsDb, decideRescheduleRequestDb } from '../../../../../../src/lib/db.mjs';
import { rescheduleErrorToResponseParts } from '../../../../../../src/lib/reschedule.mjs';
import { notifyRescheduleDecided } from '../../../../../../src/lib/reschedule-notify';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const { requestId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim();
  const note = String(body?.note || '').trim();
  if (!['approve', 'reject'].includes(action)) {
    return Response.json(fail('BAD_REQUEST', 'action 須為 approve 或 reject'), { status: 400 });
  }

  try {
    // 所有權驗證：申請必須屬於本嚮導的活動
    const mine = await listGuideRescheduleRequestsDb({
      guideId: session.guideId,
      guideSlug: session.guideId,
    });
    if (!mine.some((r: { id: string }) => r.id === requestId)) {
      return Response.json(fail('REQUEST_NOT_FOUND', 'reschedule request not found'), { status: 404 });
    }

    const result = await decideRescheduleRequestDb({
      requestId,
      action,
      resolver: `guide:${session.guideId}`,
      note,
    });

    // 通知旅客（best-effort）
    void notifyRescheduleDecided(result, action).catch(() => {});

    return Response.json(ok(result));
  } catch (error) {
    const parts = rescheduleErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
