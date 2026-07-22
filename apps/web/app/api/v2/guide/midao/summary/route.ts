/**
 * GET /api/v2/guide/midao/summary — midao2 首頁摘要。
 * Auth: guide session（HMAC cookie）。
 */
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { getMidaoSummaryDb } from '../../../../../../src/lib/db-midao-requests.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  try {
    const summary = await getMidaoSummaryDb(session.guideId);
    return jsonOk({ guideName: session.guideName, ...summary });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/summary' });
  }
}
