/**
 * GET /api/v2/bookings/:bookingId/transfer-info — 匯款資訊揭露（#1475）
 *
 * 僅於付款步驟，向「該筆預約的下單者」且「order 仍為 pending_payment」時，
 * 回傳導遊的不公開匯款資訊。授權與既有 /order/pay 一致：登入者 email 或
 * ?contactEmail= 需與訂單 contact_email 相符。
 *
 * 回應：
 *   200 ok({ configured:true, guideName, bankName, accountName, accountNumber, transferNote })
 *   200 ok({ configured:false })  — 導遊尚未設定匯款資訊
 *   400 / 403 / 404 — 參數錯誤 / 非本人或非待付款 / 找不到
 */
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { getGuideTransferInfoForBookingDb } from '../../../../../../src/lib/db.mjs';
import { isTransferPaymentEnabled } from '../../../../../../src/config/feature-flags.mjs';

function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

export async function GET(request: Request, context: { params: Promise<{ bookingId: string }> }) {
  if (!isTransferPaymentEnabled()) {
    return jsonError('NOT_FOUND', 'transfer payment disabled', 404);
  }
  const { bookingId } = await context.params;
  if (!bookingId || !isValidUuid(bookingId)) {
    return jsonError('VALIDATION_ERROR', 'Invalid bookingId', 400);
  }

  try {
    const info = await getGuideTransferInfoForBookingDb(bookingId);
    if (!info) {
      return jsonError('NOT_FOUND', 'Booking not found', 404);
    }
    if (info.orderStatus !== 'pending_payment') {
      return jsonError('FORBIDDEN', '此訂單已非待付款狀態', 403);
    }

    // 授權：登入者 email 或 ?contactEmail= 需與訂單 contact_email 相符。
    let callerEmail = '';
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      callerEmail = norm(data?.user?.email);
    } catch {
      callerEmail = '';
    }
    const queryEmail = norm(new URL(request.url).searchParams.get('contactEmail'));
    const orderEmail = norm(info.contactEmail);
    const authorized = Boolean(orderEmail) && (callerEmail === orderEmail || queryEmail === orderEmail);
    if (!authorized) {
      return jsonError('FORBIDDEN', '無權檢視此訂單的匯款資訊', 403);
    }

    const configured = Boolean(info.bankName && info.accountNumber);
    if (!configured) {
      return jsonOk({ configured: false, guideName: info.guideName });
    }
    return jsonOk({
        configured: true,
        guideName: info.guideName,
        bankName: info.bankName,
        accountName: info.accountName,
        accountNumber: info.accountNumber,
        transferNote: info.transferNote,
      });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/bookings/transfer-info' });
  }
}
