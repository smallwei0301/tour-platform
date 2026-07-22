/**
 * GET/PATCH /api/v2/guide/midao/profile-extras — 我的頁面小欄位（目前僅導覽經驗年資）。
 * Auth: guide session；PATCH 需 CSRF，GET 免。
 * 注意：experienceYears 初值必須經由本 GET 讀取，不得改用公開接案頁 API
 *（`/api/v2/public/midao/guides/{slug}`）——導遊尚無已上架服務時該 API 404，會讓年資恆顯示 0。
 */
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { updateGuideExperienceYearsDb, getGuideExperienceYearsDb } from '../../../../../../src/lib/midao/db-midao-showcase.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  try {
    const experienceYears = await getGuideExperienceYearsDb(session.guideId);
    return jsonOk({ experienceYears });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/profile-extras:get' });
  }
}

export async function PATCH(request: Request) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  let body: { experienceYears?: unknown } = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', '請求格式不正確', 400); }
  try {
    const result = await updateGuideExperienceYearsDb(session.guideId, body.experienceYears);
    if (!result.ok) return jsonError(result.code, result.message, 400);
    return jsonOk({ experienceYears: result.experienceYears });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/profile-extras' });
  }
}
