/**
 * PATCH /api/v2/guide/midao/services/[activityId] — 編輯服務 midao 欄位／接案頁上下架。
 * Auth: guide session＋CSRF；ownership 由領域檔以 guide_id 過濾內建（查無回 404）。
 */
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import { updateMidaoServiceDb } from '../../../../../../../src/lib/db-midao-showcase.mjs';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';

export async function PATCH(request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const { activityId } = await params;
  let body: unknown = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  try {
    const result = await updateMidaoServiceDb(session.guideId, activityId, body);
    if (!result.ok) {
      return jsonError(result.code, result.message, result.code === 'NOT_FOUND' ? 404 : 400);
    }
    return jsonOk({ service: result.service });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/services:patch' });
  }
}
