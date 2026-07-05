/**
 * GET /api/v2/guide/reviews
 * Issue #1592 — 導遊後台：列出自己活動的已核准評論（供回覆用）。
 * Auth: guide session cookie（HMAC）。GET 無副作用，不需 CSRF。
 * 不回傳旅客 PII（只有評論本體：作者暱稱、星等、內容、日期、既有導遊回覆）。
 */

import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { listGuideReviewsDb } from '../../../../../src/lib/db-review-reply.mjs';
import { jsonOk, jsonError } from '../../../../../src/lib/api-response';
import { reportRouteError } from '../../../../../src/lib/route-error';

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) {
    return jsonError('UNAUTHORIZED', 'Guide session required', 401);
  }

  try {
    const items = await listGuideReviewsDb({ guideId: session.guideId, limit: 100 });
    return jsonOk({ items });
  } catch (err) {
    await reportRouteError(err, { route: 'v2/guide/reviews:list' });
    return jsonError('SERVER_ERROR', 'Server error', 500);
  }
}
