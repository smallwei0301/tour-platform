/**
 * GET/POST /api/guide/orders/[orderId]/messages — 嚮導端訂單留言串（#1411）
 * 活動歸屬（activities.guide_id）由 db.mjs gateway 把關，非歸屬回 403。
 */
import { ok, fail } from '../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { listOrderMessagesDb, createOrderMessageDb } from '../../../../../../src/lib/db.mjs';
import { orderMessageErrorToResponseParts } from '../../../../../../src/lib/order-messages.mjs';
import { notifyTravelerOfOrderMessage } from '../../../../../../src/lib/order-message-notify';
import { messageSendLimiter, createRateLimitResponse } from '../../../../../../src/lib/rate-limit';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const { orderId } = await params;
  try {
    const thread = await listOrderMessagesDb({
      orderId,
      guideId: session.guideId,
      guideSlug: session.guideId,
    });
    return Response.json(ok(thread));
  } catch (error) {
    const parts = orderMessageErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const rateResult = messageSendLimiter.check(`order-message:guide:${session.guideId}`);
  const rateLimited = createRateLimitResponse(rateResult);
  if (rateLimited) return rateLimited;

  const { orderId } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const result = await createOrderMessageDb({
      orderId,
      senderRole: 'guide',
      senderId: session.guideId,
      body: body?.body,
      guideId: session.guideId,
      guideSlug: session.guideId,
    });

    // 通知旅客（best-effort：寄送失敗不影響留言成立）
    void notifyTravelerOfOrderMessage(result).catch(() => {});

    return Response.json(ok(result.message), { status: 201 });
  } catch (error) {
    const parts = orderMessageErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
