/**
 * GET /api/v2/admin/midao/requests — 管理員跨導遊需求單唯讀視圖（Plan3 Task5）。
 * Auth：由 middleware `/api/v2/admin/:path*` matcher 統一把關，本 route 不重複驗證身分。
 */
import { listAllMidaoRequestsDb } from '../../../../../../src/lib/midao/db-midao-requests.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';

const STATUSES = ['all', 'new', 'pending_reply', 'replied', 'closed'];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'all';
  if (!STATUSES.includes(status)) return jsonError('INVALID_STATUS', '狀態篩選不正確', 400);
  try {
    const result = await listAllMidaoRequestsDb({ status });
    return jsonOk(result);
  } catch (err) {
    return handleRouteError(err, { route: 'v2/admin/midao/requests:list' });
  }
}
