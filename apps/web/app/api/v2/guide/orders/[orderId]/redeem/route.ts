/**
 * POST /api/v2/guide/orders/[orderId]/redeem — Issue #1565
 *
 * 導遊掃碼/輸碼核銷電子憑證：驗證 voucher token（HMAC）→ 確認訂單屬於該導遊
 * → confirmed 轉 completed（冪等）。掃碼＝「提前、明確」的完成路徑（#1554 sweep 為兜底）。
 *
 * Auth：guide session cookie（HMAC）＋ CSRF double-submit。
 * Body：{ token: string }（旅客憑證頁的 QR/短碼對應的簽章 token）。
 * 冪等：已 completed → 200 { alreadyRedeemed: true }。無 voucher PII 於回應。
 */
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import { ok, fail } from '../../../../../../../src/lib/api';
import { reportRouteError } from '../../../../../../../src/lib/route-error';
import { verifyVoucherToken, resolveVoucherSecret } from '../../../../../../../src/lib/voucher-token.mjs';
import { redeemVoucherDb } from '../../../../../../../src/lib/db-redeem.mjs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  const { orderId } = await params;

  let body: { token?: string } = {};
  try {
    body = await request.json();
  } catch {
    // token 也可缺（純輸短碼流程可另設計）；此處要求 token
  }

  const token = typeof body?.token === 'string' ? body.token : '';
  // 驗證 voucher token 並確認其綁定的 orderId 與路徑一致（防跨單核銷）
  const tokenOrderId = verifyVoucherToken(token, resolveVoucherSecret());
  if (!tokenOrderId || tokenOrderId !== orderId) {
    return Response.json(fail('INVALID_VOUCHER', '憑證無效或與訂單不符'), { status: 400 });
  }

  try {
    const result = await redeemVoucherDb({ orderId, guideId: session.guideId, now: new Date().toISOString() });

    if (result.reason === 'not_found') {
      return Response.json(fail('NOT_FOUND', '找不到訂單'), { status: 404 });
    }
    if (result.reason === 'not_owner') {
      return Response.json(fail('FORBIDDEN', '此訂單不屬於你'), { status: 403 });
    }
    if (result.alreadyRedeemed) {
      return Response.json(ok({ redeemed: false, alreadyRedeemed: true, status: 'completed' }), { status: 200 });
    }
    if (!result.redeemed) {
      return Response.json(fail('NOT_REDEEMABLE', `訂單狀態不可核銷（${result.status}）`), { status: 409 });
    }
    return Response.json(ok({ redeemed: true, alreadyRedeemed: false, status: 'completed' }), { status: 200 });
  } catch (err) {
    await reportRouteError(err, { route: 'v2/guide/orders/redeem' });
    return Response.json(fail('INTERNAL_ERROR', '核銷失敗，請稍後再試'), { status: 500 });
  }
}
