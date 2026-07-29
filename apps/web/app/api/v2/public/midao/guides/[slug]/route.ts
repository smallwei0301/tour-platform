/**
 * GET /api/v2/public/midao/guides/[slug] — 公開接案頁資料。
 * 無 auth。未達公開條件（不存在/未 approved/無可見服務）一律同一種 404，不洩漏導遊存在與否。
 * 不回傳導遊私人資料（email/LINE 綁定/銀行）；guideId 為內部欄位，回應前剔除，保持回應面最小。
 */
import { getPublicMidaoPageDb } from '../../../../../../../src/lib/midao/db-midao-showcase.mjs';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const page = await getPublicMidaoPageDb(slug);
    if (!page) return jsonError('NOT_FOUND', '找不到此接案頁', 404);
    const { guideId: _guideId, ...publicPage } = page;
    return jsonOk(publicPage);
  } catch (err) {
    return handleRouteError(err, { route: 'v2/public/midao/guides:page' });
  }
}
