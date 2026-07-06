/**
 * PATCH/DELETE /api/v2/admin/activities/[activityId]/addons/[addonId]
 * Issue #1591 後台編輯 — 管理者更新/刪除加購項目。
 * Auth: 管理者身分由 middleware 於 /api/v2/admin/** 把關；另需 CSRF。加購項須屬於該活動。
 */
import { validateCsrf } from '../../../../../../../../src/lib/csrf.mjs';
import {
  updateActivityAddonDb, deleteActivityAddonDb, getAddonActivityIdDb, normalizeAddonInput,
} from '../../../../../../../../src/lib/db-addons.mjs';
import { jsonOk, jsonError } from '../../../../../../../../src/lib/api-response';
import { reportRouteError } from '../../../../../../../../src/lib/route-error';

async function denyIfMismatch(activityId: string, addonId: string): Promise<Response | null> {
  const owner = await getAddonActivityIdDb(addonId);
  if (owner !== activityId) return jsonError('ADDON_NOT_FOUND', '加購項不存在', 404);
  return null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ activityId: string; addonId: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const { activityId, addonId } = await params;
  const deny = await denyIfMismatch(activityId, addonId);
  if (deny) return deny;
  let body: unknown = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', 'invalid JSON body', 400); }
  const norm = normalizeAddonInput(body, true);
  if (!norm.ok) return jsonError(norm.code, norm.message, 400);
  try {
    const updated = await updateActivityAddonDb(addonId, norm.value);
    return updated ? jsonOk({ addon: updated }) : jsonError('ADDON_NOT_FOUND', '加購項不存在', 404);
  } catch (err) {
    await reportRouteError(err, { route: 'v2/admin/activities/addons:update' });
    return jsonError('SERVER_ERROR', 'Server error', 500);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ activityId: string; addonId: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const { activityId, addonId } = await params;
  const deny = await denyIfMismatch(activityId, addonId);
  if (deny) return deny;
  try {
    await deleteActivityAddonDb(addonId);
    return jsonOk({ deleted: true });
  } catch (err) {
    await reportRouteError(err, { route: 'v2/admin/activities/addons:delete' });
    return jsonError('SERVER_ERROR', 'Server error', 500);
  }
}
