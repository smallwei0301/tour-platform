/**
 * GET/POST /api/v2/orders/[orderId]/messages — 訂單留言串（#1649 Phase 2）
 *
 * legacy /api/me/orders/[orderId]/messages（#1411）的 v2 對應（行為等價）：
 * 窗口/ownership 由 db gateway 把關；通知 best-effort；POST 有 rate limit。
 * CSRF：route 內顯式驗證（middleware 不涵蓋 /api/v2 非 admin 路徑）。
 */
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { parseBody } from '../../../../../../src/lib/validation/parse-body';
import { OrderMessageBodySchema } from '../../../../../../src/lib/validation/traveler-order-schemas';
import { getTravelerIdentity } from '../../../../../../src/lib/v2/traveler-auth';
import { listOrderMessagesDb, createOrderMessageDb } from '../../../../../../src/lib/db.mjs';
import { orderMessageErrorToResponseParts } from '../../../../../../src/lib/order-messages.mjs';
import { notifyGuideOfOrderMessage } from '../../../../../../src/lib/order-message-notify';
import { messageSendLimiter, createRateLimitResponse } from '../../../../../../src/lib/rate-limit';

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const user = await getTravelerIdentity();
  if (!user?.email) {
    return jsonError('UNAUTHORIZED', 'Please login first', 401);
  }

  try {
    const thread = await listOrderMessagesDb({ orderId, contactEmail: user.email });
    return jsonOk(thread);
  } catch (error) {
    const parts = orderMessageErrorToResponseParts(error);
    return jsonError(parts.code, parts.message, parts.status);
  }
}

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

  const rateResult = messageSendLimiter.check(`order-message:traveler:${user.id || user.email}`);
  const rateLimited = createRateLimitResponse(rateResult);
  if (rateLimited) return rateLimited;

  const parsed = await parseBody(request, OrderMessageBodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await createOrderMessageDb({
      orderId,
      senderRole: 'traveler',
      senderId: user.id || user.email,
      body: parsed.data.body,
      contactEmail: user.email,
    });

    // 通知嚮導（best-effort：寄送失敗不影響留言成立）
    void notifyGuideOfOrderMessage(result).catch(() => {});

    return jsonOk(result.message, { status: 201 });
  } catch (error) {
    const parts = orderMessageErrorToResponseParts(error);
    return jsonError(parts.code, parts.message, parts.status);
  }
}
