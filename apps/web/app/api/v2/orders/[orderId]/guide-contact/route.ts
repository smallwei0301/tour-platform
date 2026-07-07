/**
 * GET /api/v2/orders/[orderId]/guide-contact — 行前 24h 導遊聯絡（#1649 Phase 2）
 *
 * legacy /api/me/orders/[orderId]/guide-contact（#1596）的 v2 對應（行為等價）：
 * 僅「confirmed 訂單、現在落在出發前 24h～活動結束、導遊已同意揭露」時回 guideContact，
 * 否則 null（資格外絕不回傳電話，防 PII 外洩）。ownership 由 db 層以 contact_email 把關。
 */
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { getTravelerIdentity } from '../../../../../../src/lib/v2/traveler-auth';
import { getEligibleGuideContactDb } from '../../../../../../src/lib/db-pre-tour-contact.mjs';

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await context.params;

    const user = await getTravelerIdentity();

    // guest 存取沿用既有 order-status-by-email pattern
    const url = new URL(request.url);
    const guestEmail = url.searchParams.get('contactEmail') || '';
    const contactEmail = user?.email || guestEmail;
    if (!contactEmail) {
      return jsonError('UNAUTHORIZED', 'Please login first', 401);
    }

    const guideContact = await getEligibleGuideContactDb({
      orderId,
      contactEmail,
      now: new Date().toISOString(),
    });

    // 資格外：guideContact = null（不帶電話欄位值）
    return jsonOk({ guideContact });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return jsonError('INVALID_REQUEST', message, status);
  }
}
