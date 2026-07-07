/**
 * POST /api/v2/guide/redeem/by-code — #1637 導遊端核銷頁（短碼備援）。
 *
 * 導遊輸入旅客憑證卡上的短碼（MID-XXXXXX）核銷：ownership 先於比對——只在該導遊
 * 自己的 confirmed/completed 訂單內找短碼，找到 confirmed 即核銷（confirmed → completed，
 * 與掃碼核銷同一 db 層、同冪等語意），completed 回 alreadyRedeemed。
 *
 * Auth：guide session cookie（HMAC）＋ CSRF double-submit。
 * Body：{ code: string }（大小寫不拘、可省略 MID- 前綴）。
 */
import { validateCsrf } from '../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';
import { redeemVoucherByShortCodeDb } from '../../../../../../src/lib/db-redeem.mjs';
import { parseBody } from '../../../../../../src/lib/validation/parse-body';
import { RedeemByCodeBodySchema } from '../../../../../../src/lib/validation/payment-schemas';

export async function POST(request: Request) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = verifyGuideSession(request);
  if (!session) {
    return jsonError('UNAUTHORIZED', 'Guide session required', 401);
  }

  const parsed = await parseBody(request, RedeemByCodeBodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await redeemVoucherByShortCodeDb({
      code: parsed.data.code,
      guideId: session.guideId,
      now: new Date().toISOString(),
    });

    if (result.reason === 'invalid_code') {
      return jsonError('INVALID_CODE', '短碼格式不正確（應為 MID- 開頭的 6 碼）', 400);
    }
    if (result.reason === 'not_found') {
      return jsonError('NOT_FOUND', '找不到符合此短碼的可核銷訂單（僅限你名下已確認的訂單）', 404);
    }
    if (result.reason === 'not_owner') {
      return jsonError('FORBIDDEN', '此訂單不屬於你', 403);
    }
    if (result.alreadyRedeemed) {
      return jsonOk({
        redeemed: false,
        alreadyRedeemed: true,
        status: 'completed',
        orderId: result.orderId,
        contactName: result.contactName ?? null,
        peopleCount: result.peopleCount ?? null,
      });
    }
    if (!result.redeemed) {
      return jsonError('NOT_REDEEMABLE', `訂單狀態不可核銷（${result.status}）`, 409);
    }
    return jsonOk({
      redeemed: true,
      alreadyRedeemed: false,
      status: 'completed',
      orderId: result.orderId,
      contactName: result.contactName ?? null,
      peopleCount: result.peopleCount ?? null,
    });
  } catch (err) {
    return handleRouteError(err, {
      route: 'v2/guide/redeem/by-code',
      category: 'voucher_redeem',
    });
  }
}
