/**
 * GET/PATCH /api/v2/guide/midao/requests/[requestId] — 需求詳情／狀態更新。
 * Auth: guide session（ownership 由領域檔以 guide_id 過濾內建）；PATCH 需 CSRF。
 */
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import {
  getMidaoRequestDb, updateMidaoRequestStatusDb, MIDAO_REQUEST_STATUSES,
} from '../../../../../../../src/lib/midao/db-midao-requests.mjs';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';

export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const { requestId } = await params;
  try {
    const found = await getMidaoRequestDb(session.guideId, requestId);
    if (!found) return jsonError('NOT_FOUND', '需求單不存在', 404);
    return jsonOk({ request: found });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/requests:detail' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const { requestId } = await params;
  let body: { status?: string } = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  if (!body.status || !MIDAO_REQUEST_STATUSES.includes(body.status)) {
    return jsonError('INVALID_STATUS', '狀態不正確', 400);
  }
  try {
    const result = await updateMidaoRequestStatusDb(session.guideId, requestId, body.status);
    if (!result.ok) {
      return jsonError(result.code, result.message, result.code === 'NOT_FOUND' ? 404 : 409);
    }
    return jsonOk({ request: result.request });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/requests:patch' });
  }
}
