/**
 * GET/PUT /api/v2/guide/midao/availability/defaults — 週可用時間預設。
 * Auth: guide session；PUT 需 CSRF。
 */
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import { getWeeklyDefaultsDb, setWeeklyDefaultsDb } from '../../../../../../../src/lib/midao/db-midao-availability.mjs';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  try {
    return jsonOk({ weekdays: await getWeeklyDefaultsDb(session.guideId) });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/availability/defaults:get' });
  }
}

export async function PUT(request: Request) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  let body: { weekdays?: unknown } = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  if (!Array.isArray(body.weekdays)) return jsonError('INVALID_REQUEST', 'weekdays 需為陣列', 400);
  try {
    await setWeeklyDefaultsDb(session.guideId, body.weekdays);
    return jsonOk({ weekdays: await getWeeklyDefaultsDb(session.guideId) });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/availability/defaults:put' });
  }
}
