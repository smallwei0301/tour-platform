/**
 * PATCH/DELETE /api/v2/guide/activities/[activityId]/addons/[addonId]
 * Issue #1591 後台編輯 — 導遊更新/刪除自己活動的加購項目。
 * Auth: guide session ＋ ownership（活動屬於此導遊，且該加購項屬於此活動）＋ CSRF。
 */
import { validateCsrf } from '../../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../../src/lib/guide-auth';
import { assertActivityBelongsToGuide } from '../../../../../../../../src/lib/assert-activity-belongs-to-guide';
import { hasSupabaseEnv, getSupabase } from '../../../../../../../../src/lib/db.mjs';
import {
  updateActivityAddonDb, deleteActivityAddonDb, getAddonActivityIdDb, normalizeAddonInput,
} from '../../../../../../../../src/lib/db-addons.mjs';
import { jsonOk, jsonError } from '../../../../../../../../src/lib/api-response';
import { reportRouteError } from '../../../../../../../../src/lib/route-error';

/** ownership：活動屬於此導遊，且加購項屬於此活動。回 deny Response 或 null。 */
async function denyIfNotOwner(guideId: string, activityId: string, addonId: string): Promise<Response | null> {
  if (hasSupabaseEnv()) {
    const supabase = await getSupabase();
    const r = await assertActivityBelongsToGuide({ activityId, guideId, supabase });
    if (!r.ok) {
      return r.code === 'ACTIVITY_NOT_FOUND'
        ? jsonError('ACTIVITY_NOT_FOUND', '活動不存在', 404)
        : jsonError('ACTIVITY_WRONG_GUIDE', '非您的活動', 403);
    }
  }
  const owner = await getAddonActivityIdDb(addonId);
  if (owner !== activityId) return jsonError('ADDON_NOT_FOUND', '加購項不存在', 404);
  return null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ activityId: string; addonId: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', 'Guide session required', 401);
  const { activityId, addonId } = await params;
  const deny = await denyIfNotOwner(session.guideId, activityId, addonId);
  if (deny) return deny;
  let body: unknown = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', 'invalid JSON body', 400); }
  const norm = normalizeAddonInput(body, true);
  if (!norm.ok) return jsonError(norm.code, norm.message, 400);
  try {
    const updated = await updateActivityAddonDb(addonId, norm.value);
    return updated ? jsonOk({ addon: updated }) : jsonError('ADDON_NOT_FOUND', '加購項不存在', 404);
  } catch (err) {
    await reportRouteError(err, { route: 'v2/guide/activities/addons:update' });
    return jsonError('SERVER_ERROR', 'Server error', 500);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ activityId: string; addonId: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', 'Guide session required', 401);
  const { activityId, addonId } = await params;
  const deny = await denyIfNotOwner(session.guideId, activityId, addonId);
  if (deny) return deny;
  try {
    await deleteActivityAddonDb(addonId);
    return jsonOk({ deleted: true });
  } catch (err) {
    await reportRouteError(err, { route: 'v2/guide/activities/addons:delete' });
    return jsonError('SERVER_ERROR', 'Server error', 500);
  }
}
