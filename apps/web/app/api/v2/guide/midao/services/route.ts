/**
 * GET/POST /api/v2/guide/midao/services — 服務列表／精靈建立（服務＝既有 activities）。
 * Auth: guide session；POST 需 CSRF。主站 status 恆為 draft（發佈到祕島走既有 submit API）。
 */
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import {
  listMidaoServicesDb, createMidaoServiceDb, normalizeServiceInput,
} from '../../../../../../src/lib/midao/db-midao-showcase.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  try {
    return jsonOk({ items: await listMidaoServicesDb(session.guideId) });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/services:list' });
  }
}

export async function POST(request: Request) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  let body: { publish?: boolean } = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  const norm = normalizeServiceInput(body);
  if (!norm.ok) return jsonError(norm.code, norm.message, 400);
  try {
    const service = await createMidaoServiceDb(session.guideId, norm.value, { publish: body.publish === true });
    return jsonOk({ service });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/services:create' });
  }
}
