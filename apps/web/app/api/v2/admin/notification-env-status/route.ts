/**
 * GET /api/v2/admin/notification-env-status — 通知通道 env 存在性診斷（admin-only）。
 *
 * 回報各通道旗標開關與 secrets 是否有值的**布林地圖**，絕不回傳 env 值本身——
 * 供遠端確認生產環境 email／LINE／Telegram 通知的部署前提（旗標／token／chat id）。
 * admin auth 由 middleware（/api/v2/admin/** 前門）統一守護；env 讀取集中在
 * src/config/notification-env-status.mjs（env 直讀 ratchet 豁免區）。
 */
import { jsonOk } from '../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../src/lib/route-error';
import { getNotificationEnvStatus } from '../../../../../src/config/notification-env-status.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return jsonOk(getNotificationEnvStatus());
  } catch (err) {
    return handleRouteError(err, { route: 'v2/admin/notification-env-status' });
  }
}
