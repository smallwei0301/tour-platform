/**
 * GET /api/admin/orders/[orderId]/messages — admin 唯讀留言串（#1411 第一期）
 * 僅 GET：admin 第一期不發言（無 POST export）。admin auth 由 middleware 把關。
 */
import { ok, fail } from '../../../../../../src/lib/api';
import { listOrderMessagesDb } from '../../../../../../src/lib/db.mjs';
import { orderMessageErrorToResponseParts } from '../../../../../../src/lib/order-messages.mjs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  try {
    const thread = await listOrderMessagesDb({ orderId });
    return Response.json(ok(thread));
  } catch (error) {
    const parts = orderMessageErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
