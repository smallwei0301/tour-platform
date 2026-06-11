/**
 * GET/POST /api/me/orders/[orderId]/messages — 訂單留言串（#1411）
 * CSRF 由 middleware 涵蓋 /api/me/**；窗口/ownership 由 db.mjs gateway 把關。
 * 通知信 best-effort，不阻斷主流程；節流由 gateway 回傳 shouldNotify。
 */
import { ok, fail } from '../../../../../../src/lib/api';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { listOrderMessagesDb, createOrderMessageDb } from '../../../../../../src/lib/db.mjs';
import { orderMessageErrorToResponseParts } from '../../../../../../src/lib/order-messages.mjs';
import { notifyGuideOfOrderMessage } from '../../../../../../src/lib/order-message-notify';
import { messageSendLimiter, createRateLimitResponse } from '../../../../../../src/lib/rate-limit';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return Response.json(fail('UNAUTHORIZED', 'login required'), { status: 401 });
  }

  try {
    const thread = await listOrderMessagesDb({ orderId, contactEmail: user.email });
    return Response.json(ok(thread));
  } catch (error) {
    const parts = orderMessageErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return Response.json(fail('UNAUTHORIZED', 'login required'), { status: 401 });
  }

  const rateResult = messageSendLimiter.check(`order-message:traveler:${user.id || user.email}`);
  const rateLimited = createRateLimitResponse(rateResult);
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));

  try {
    const result = await createOrderMessageDb({
      orderId,
      senderRole: 'traveler',
      senderId: user.id || user.email,
      body: body?.body,
      contactEmail: user.email,
    });

    // 通知嚮導（best-effort：寄送失敗不影響留言成立）
    void notifyGuideOfOrderMessage(result).catch(() => {});

    return Response.json(ok(result.message), { status: 201 });
  } catch (error) {
    const parts = orderMessageErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
