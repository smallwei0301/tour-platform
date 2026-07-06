/**
 * GET/POST /api/v2/guide/activities/[activityId]/addons
 * Issue #1591 後台編輯 — 導遊管理自己活動的加購項目。
 * Auth: guide session（HMAC cookie）＋ ownership（activities.guide_id === session.guideId）；POST 需 CSRF。
 */
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import { assertActivityBelongsToGuide } from '../../../../../../../src/lib/assert-activity-belongs-to-guide';
import { hasSupabaseEnv, getSupabase } from '../../../../../../../src/lib/db.mjs';
import { listActivityAddonsForEditDb, createActivityAddonDb, normalizeAddonInput } from '../../../../../../../src/lib/db-addons.mjs';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { reportRouteError } from '../../../../../../../src/lib/route-error';

/** ownership：本地 fallback（無 supabase）略過；production 檢查 guide 擁有此活動。回 deny Response 或 null。 */
async function denyIfNotOwner(guideId: string, activityId: string): Promise<Response | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const r = await assertActivityBelongsToGuide({ activityId, guideId, supabase });
  if (!r.ok) {
    return r.code === 'ACTIVITY_NOT_FOUND'
      ? jsonError('ACTIVITY_NOT_FOUND', '活動不存在', 404)
      : jsonError('ACTIVITY_WRONG_GUIDE', '非您的活動', 403);
  }
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', 'Guide session required', 401);
  const { activityId } = await params;
  const deny = await denyIfNotOwner(session.guideId, activityId);
  if (deny) return deny;
  try {
    return jsonOk({ items: await listActivityAddonsForEditDb(activityId) });
  } catch (err) {
    await reportRouteError(err, { route: 'v2/guide/activities/addons:list' });
    return jsonError('SERVER_ERROR', 'Server error', 500);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', 'Guide session required', 401);
  const { activityId } = await params;
  const deny = await denyIfNotOwner(session.guideId, activityId);
  if (deny) return deny;
  let body: unknown = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', 'invalid JSON body', 400); }
  const norm = normalizeAddonInput(body);
  if (!norm.ok) return jsonError(norm.code, norm.message, 400);
  try {
    return jsonOk({ addon: await createActivityAddonDb(activityId, norm.value) });
  } catch (err) {
    await reportRouteError(err, { route: 'v2/guide/activities/addons:create' });
    return jsonError('SERVER_ERROR', 'Server error', 500);
  }
}
