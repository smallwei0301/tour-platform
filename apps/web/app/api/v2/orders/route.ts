/**
 * GET /api/v2/orders — 旅人訂單列表（#1649 Phase 1）
 *
 * legacy GET /api/me/orders 的 v2 對應：登入旅客以 user_id + email 查自己的訂單
 * （相容舊訂單 email 綁定），資料層沿用 db.mjs gateway（含 in-memory fallback）。
 * 回應列 shape 與 legacy 完全一致（/me/orders 與 shop orders 頁共用型別），
 * envelope 改為 V2 契約 { success, data }。
 */
import { jsonOk, jsonError } from '../../../../src/lib/api-response';
import { handleRouteError } from '../../../../src/lib/route-error';
import { listMyOrdersDb } from '../../../../src/lib/db.mjs';
import { getTravelerIdentity } from '../../../../src/lib/v2/traveler-auth';
import { myOrdersLimiter, createRateLimitResponse, RateLimiter } from '../../../../src/lib/rate-limit';

export async function GET(request: Request) {
  // Rate limiting: 20 requests/min per IP（與 legacy /api/me/orders 相同額度）
  const ip = RateLimiter.getClientIp(request);
  const rlResult = myOrdersLimiter.check(ip);
  const rlResponse = createRateLimitResponse(rlResult);
  if (rlResponse) return rlResponse;

  try {
    const user = await getTravelerIdentity();

    if (!user?.email) {
      return jsonError('UNAUTHORIZED', 'Please login first', 401);
    }

    const rows = await listMyOrdersDb({ userId: user.id, contactEmail: user.email });
    return jsonOk(rows);
  } catch (err) {
    return handleRouteError(err, { route: 'v2/orders/list' });
  }
}
