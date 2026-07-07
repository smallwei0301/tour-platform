/**
 * DELETE /api/v2/orders/[orderId]/reschedule-requests/[requestId] — 撤回改期申請
 * （#1649 Phase 2）legacy 對應 route 的 v2 版（行為等價）。
 * CSRF：route 內顯式驗證（middleware 不涵蓋 /api/v2 非 admin 路徑）。
 */
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { reportRouteError } from '../../../../../../../src/lib/route-error';
import { getTravelerIdentity } from '../../../../../../../src/lib/v2/traveler-auth';
import { withdrawRescheduleRequestDb } from '../../../../../../../src/lib/db.mjs';
import { rescheduleErrorToResponseParts } from '../../../../../../../src/lib/reschedule.mjs';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ orderId: string; requestId: string }> }
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const { requestId } = await context.params;
  const user = await getTravelerIdentity();
  if (!user?.email) {
    return jsonError('UNAUTHORIZED', 'Please login first', 401);
  }

  try {
    const result = await withdrawRescheduleRequestDb({ requestId, contactEmail: user.email });
    return jsonOk(result);
  } catch (error) {
    const parts = rescheduleErrorToResponseParts(error);
    // 業務規則錯誤（4xx）不進 incident；未預期例外（500）上報（#1598）。
    if (parts.status >= 500) await reportRouteError(error, { route: 'v2/orders/reschedule-requests/withdraw' });
    return jsonError(parts.code, parts.message, parts.status);
  }
}
