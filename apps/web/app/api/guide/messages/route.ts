/**
 * GET /api/guide/messages — 嚮導留言串清單（#1411）
 * 待回覆（最後一則為旅客）排前，再依最後留言時間新→舊。
 */
import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { listGuideMessageThreadsDb } from '../../../../src/lib/db.mjs';
import { orderMessageErrorToResponseParts } from '../../../../src/lib/order-messages.mjs';

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  try {
    const threads = await listGuideMessageThreadsDb({
      guideId: session.guideId,
      guideSlug: session.guideId,
    });
    return Response.json(ok(threads));
  } catch (error) {
    const parts = orderMessageErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
