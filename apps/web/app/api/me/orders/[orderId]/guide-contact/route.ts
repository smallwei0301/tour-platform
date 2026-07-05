/**
 * GET /api/me/orders/[orderId]/guide-contact — Issue #1596
 *
 * 行前 24h 導遊聯絡：僅在「confirmed 訂單、現在落在出發前 24h～活動結束、且導遊已同意揭露」
 * 時回 guideContact；否則 guideContact 為 null（**資格外絕不回傳電話**，避免 PII 外洩）。
 *
 * Auth：登入旅客（Supabase cookie）或 guest（?contactEmail= 對應訂單聯絡信箱）——與既有
 * /api/me/orders/[orderId] 同型。ownership 由 db 層以 contact_email 再把關（防跨單）。
 */
import { ok, fail } from '../../../../../../src/lib/api';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { getEligibleGuideContactDb } from '../../../../../../src/lib/db-pre-tour-contact.mjs';

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // guest 存取沿用既有 order-status-by-email pattern
    const url = new URL(request.url);
    const guestEmail = url.searchParams.get('contactEmail') || '';
    const contactEmail = user?.email || guestEmail;
    if (!contactEmail) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    const guideContact = await getEligibleGuideContactDb({
      orderId,
      contactEmail,
      now: new Date().toISOString(),
    });

    // 資格外：guideContact = null（不帶電話欄位值）
    return Response.json(ok({ guideContact }), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('not found') ? 404 : 400;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
