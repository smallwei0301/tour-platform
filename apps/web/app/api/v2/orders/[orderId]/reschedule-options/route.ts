/**
 * GET /api/v2/orders/[orderId]/reschedule-options — 同活動可改期場次（#1649 Phase 2）
 * legacy /api/me/orders/[orderId]/reschedule-options 的 v2 對應（行為等價）。
 * 身分：登入旅客或 guest ?contactEmail=（沿用訂單詳情 pattern）。
 */
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { reportRouteError } from '../../../../../../src/lib/route-error';
import { getTravelerIdentity } from '../../../../../../src/lib/v2/traveler-auth';
import { listRescheduleOptionsDb } from '../../../../../../src/lib/db.mjs';
import { rescheduleErrorToResponseParts } from '../../../../../../src/lib/reschedule.mjs';

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const user = await getTravelerIdentity();
  const url = new URL(request.url);
  const contactEmail = user?.email || url.searchParams.get('contactEmail') || '';
  if (!contactEmail) {
    return jsonError('UNAUTHORIZED', 'Please login first', 401);
  }

  try {
    const options = await listRescheduleOptionsDb({ orderId, contactEmail });
    return jsonOk(options);
  } catch (error) {
    const parts = rescheduleErrorToResponseParts(error);
    // 業務規則錯誤（4xx）不進 incident；未預期例外（500）上報（#1598）。
    if (parts.status >= 500) await reportRouteError(error, { route: 'v2/orders/reschedule-options' });
    return jsonError(parts.code, parts.message, parts.status);
  }
}
