/**
 * GET /api/v2/activities/[activityId]/addons
 * Issue #1591 — 列出活動的啟用加購項目（供 checkout 選購）。
 * 公開讀取（activity_addons RLS 僅開放 is_active）；無副作用、不需 CSRF。
 */

import { listActivityAddonsDb } from '../../../../../../src/lib/db-addons.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { reportRouteError } from '../../../../../../src/lib/route-error';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  try {
    const { activityId } = await params;
    const items = await listActivityAddonsDb(activityId);
    return jsonOk({ items });
  } catch (err) {
    await reportRouteError(err, { route: 'v2/activities/addons:list' });
    return jsonError('SERVER_ERROR', 'Server error', 500);
  }
}
