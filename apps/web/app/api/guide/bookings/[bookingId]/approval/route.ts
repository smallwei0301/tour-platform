/**
 * POST /api/guide/bookings/[bookingId]/approval — 導遊審核 request 預約（先審核後付款）
 *
 * action='approve' → guide_approval_status='approved'（放行付款，booking 維持 draft）
 * action='reject'  → guide_approval_status='rejected' + booking draft→cancelled + 連動 order 取消
 *
 * 決策合法性由純函式 decideApproval（src/lib/booking-type-flow.mjs）統一判定；
 * 導遊只能審核自己的 booking（guide_id 比對）。CSRF + guide-auth 由 middleware 套用
 * （/api/guide/* 範圍）。
 */
import { ok, fail } from '../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { decideBookingApprovalDb } from '../../../../../../src/lib/db.mjs';
import { notifyBookingApprovalDecided } from '../../../../../../src/lib/booking-approval-notify';

function errorToParts(error: unknown): { code: string; message: string; status: number } {
  const raw = error instanceof Error ? error.message : String(error);
  const [code, ...rest] = raw.split(':');
  const message = rest.join(':').trim() || raw;
  const statusByCode: Record<string, number> = {
    BOOKING_NOT_FOUND: 404,
    BAD_REQUEST: 400,
    INVALID_ACTION: 400,
    NOT_APPROVABLE: 409,
    NOT_PENDING_APPROVAL: 409,
  };
  const status = statusByCode[code?.trim()] ?? 500;
  return { code: code?.trim() || 'SERVER_ERROR', message, status };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const { bookingId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim();
  const note = String(body?.note || '').trim();
  if (!['approve', 'reject'].includes(action)) {
    return Response.json(fail('BAD_REQUEST', 'action 須為 approve 或 reject'), { status: 400 });
  }

  try {
    const result = await decideBookingApprovalDb({
      bookingId,
      guideId: session.guideId,
      action,
      note,
    });

    // 通知旅客（best-effort）
    void notifyBookingApprovalDecided(result, action).catch(() => {});

    return Response.json(ok(result));
  } catch (error) {
    const parts = errorToParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
