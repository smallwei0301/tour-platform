/**
 * GET/POST /api/v2/admin/activities/[activityId]/addons
 * Issue #1591 後台編輯 — 管理者管理任一活動的加購項目。
 * Auth: 管理者身分由 middleware 於 /api/v2/admin/** 前門把關（與 plans route 一致）；POST 另需 CSRF。
 */
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { listActivityAddonsForEditDb, createActivityAddonDb, normalizeAddonInput } from '../../../../../../../src/lib/db-addons.mjs';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { reportRouteError } from '../../../../../../../src/lib/route-error';

export async function GET(_request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  try {
    return jsonOk({ items: await listActivityAddonsForEditDb(activityId) });
  } catch (err) {
    await reportRouteError(err, { route: 'v2/admin/activities/addons:list' });
    return jsonError('SERVER_ERROR', 'Server error', 500);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const { activityId } = await params;
  let body: unknown = {};
  try { body = await request.json(); } catch { return jsonError('INVALID_REQUEST', 'invalid JSON body', 400); }
  const norm = normalizeAddonInput(body);
  if (!norm.ok) return jsonError(norm.code, norm.message, 400);
  try {
    return jsonOk({ addon: await createActivityAddonDb(activityId, norm.value) });
  } catch (err) {
    await reportRouteError(err, { route: 'v2/admin/activities/addons:create' });
    return jsonError('SERVER_ERROR', 'Server error', 500);
  }
}
