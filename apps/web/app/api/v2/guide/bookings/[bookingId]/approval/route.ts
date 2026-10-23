/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/guide/bookings/[bookingId]/approval）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
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
import { reportRouteError, getErrorText, GENERIC_SERVER_ERROR_MESSAGE } from '../../../../../../../src/lib/route-error';
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { ok, fail } from '../../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import { decideBookingApprovalDb } from '../../../../../../../src/lib/db.mjs';
import { notifyBookingApprovalDecided } from '../../../../../../../src/lib/booking-approval-notify';

function errorToParts(error: unknown): { code: string; message: string; status: number } {
  const raw = getErrorText(error) || String(error); // 僅供內部分類；回應文案見下方白名單判斷
  const [code, ...rest] = raw.split(':');
  const message = rest.join(':').trim() || raw;
  const statusByCode: Record<string, number> = {
    BOOKING_NOT_FOUND: 404,
    BAD_REQUEST: 400,
    INVALID_ACTION: 400,
    NOT_APPROVABLE: 409,
    NOT_PENDING_APPROVAL: 409,
  };
  const knownCode = code?.trim();
  if (!knownCode || !Object.hasOwn(statusByCode, knownCode)) {
    // #1925：不在已知業務碼內的例外（多半是 DB／未預期錯誤）一律 500 SERVER_ERROR＋通用文案，
    // 避免把例外字串當作 code／message 外洩（原始錯誤已由呼叫端 reportRouteError 上報）。
    return { code: 'SERVER_ERROR', message: GENERIC_SERVER_ERROR_MESSAGE, status: 500 };
  }
  return { code: knownCode, message, status: statusByCode[knownCode] };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  // #1649：middleware CSRF 不涵蓋 /api/v2/guide/**，route 內顯式驗證（與 legacy 經 middleware 的保護等價）。
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

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
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(error, { route: 'v2/guide/bookings/[bookingId]/approval' });
    const parts = errorToParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
