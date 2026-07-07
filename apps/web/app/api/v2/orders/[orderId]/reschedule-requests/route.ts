/**
 * POST /api/v2/orders/[orderId]/reschedule-requests — 申請改期（#1649 Phase 2）
 * legacy /api/me/orders/[orderId]/reschedule-requests 的 v2 對應（行為等價）：
 * requestId 冪等；政策時限/資格由 reschedule.mjs 純規則把關；通知 best-effort。
 * CSRF：route 內顯式驗證（middleware 不涵蓋 /api/v2 非 admin 路徑）。
 */
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { reportRouteError } from '../../../../../../src/lib/route-error';
import { parseBody } from '../../../../../../src/lib/validation/parse-body';
import { RescheduleRequestBodySchema } from '../../../../../../src/lib/validation/traveler-order-schemas';
import { getTravelerIdentity } from '../../../../../../src/lib/v2/traveler-auth';
import { createRescheduleRequestDb } from '../../../../../../src/lib/db.mjs';
import { rescheduleErrorToResponseParts } from '../../../../../../src/lib/reschedule.mjs';
import { notifyRescheduleRequested } from '../../../../../../src/lib/reschedule-notify';

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const { orderId } = await context.params;
  const user = await getTravelerIdentity();
  if (!user?.email) {
    return jsonError('UNAUTHORIZED', 'Please login first', 401);
  }

  const parsed = await parseBody(request, RescheduleRequestBodySchema);
  if (!parsed.ok) return parsed.response;
  const { requestId, toScheduleId } = parsed.data;

  try {
    const result = await createRescheduleRequestDb({
      orderId,
      requestId,
      toScheduleId,
      contactEmail: user.email,
    });

    // 通知嚮導（best-effort：寄送失敗不影響申請成立）
    void notifyRescheduleRequested(result).catch(() => {});

    return jsonOk(result, { status: 201 });
  } catch (error) {
    const parts = rescheduleErrorToResponseParts(error);
    // 業務規則錯誤（4xx）不進 incident；未預期例外（500）上報（#1598）。
    if (parts.status >= 500) await reportRouteError(error, { route: 'v2/orders/reschedule-requests/create' });
    return jsonError(parts.code, parts.message, parts.status);
  }
}
