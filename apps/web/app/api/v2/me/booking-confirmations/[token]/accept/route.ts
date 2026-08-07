/**
 * POST /api/v2/me/booking-confirmations/[token]/accept — 旅客接受確認（#1759 Task 40）
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-07-issue1759-task40-traveler-confirmation-plan.md
 * §5.3（route 層先擋）／§6.2（邊界執行順序）／§6.3（CSRF）／§6.4（raw token 不外洩）。
 *
 * Auth：登入旅客（Supabase cookie）。CSRF：middleware 的 matcher 不含 /api/v2/me/**，
 * 故本 route 必須顯式 validateCsrf（P0 安全條件），模式對齊 v2 orders cancel route。
 *
 * 本 route 不直接碰 DB：一切寫入由 midao_accept_traveler_confirmation RPC
 * 在單一交易完成。raw token 只存在於 URL path 段與單次請求記憶體。
 */
import { isMidaoBackendMutationsEnabled } from '../../../../../../../src/config/feature-flags.mjs';
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { jsonOk } from '../../../../../../../src/lib/api-response.ts';
import { normalizeConfirmationRawToken } from '../../../../../../../src/lib/midao/booking-confirmation.ts';
import { acceptMidaoTravelerConfirmationDb } from '../../../../../../../src/lib/midao/db-midao-traveler-confirmation.mjs';
import { hashIdempotentRequest, parseIdempotencyKey } from '../../../../../../../src/lib/midao/idempotency.ts';
import { MidaoRouteError, handleMidaoRouteError as handleRouteError } from '../../../../../../../src/lib/midao/route-errors.ts';
import { getTravelerIdentity } from '../../../../../../../src/lib/v2/traveler-auth.ts';

/** 本指令沒有 body 欄位；出現任何鍵一律 422，避免請求雜訊改變 requestHash 語意。 */
function normalizeEmptyBody(value: unknown): Record<string, never> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new MidaoRouteError('INVALID_REQUEST_BODY', 'Invalid request body', 422);
  }
  if (Object.keys(value as Record<string, unknown>).length > 0) {
    throw new MidaoRouteError('INVALID_REQUEST_BODY', 'Invalid request body', 422);
  }
  return {};
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  // 1. CSRF 先於身分解析（省掉未通過 CSRF 的請求打 Supabase）
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  try {
    // 2. 功能旗標
    if (!isMidaoBackendMutationsEnabled()) {
      throw new MidaoRouteError('MUTATIONS_DISABLED', 'Midao mutations are unavailable', 503);
    }

    // 3. 路徑 token 正規化（純字串檢查；失敗塌成 404，不揭露格式是否正確）
    const rawToken = normalizeConfirmationRawToken((await context.params).token);

    // 4. 旅客身分
    const traveler = await getTravelerIdentity();
    if (!traveler?.id) {
      throw new MidaoRouteError('UNAUTHORIZED', 'Please login first', 401);
    }

    // 5. Idempotency-Key
    const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'));

    // 6./7. body 必須為空；requestHash 實算，不硬寫常數
    const parsed = await request.clone().json().catch(() => null);
    const requestHash = hashIdempotentRequest(normalizeEmptyBody(parsed));

    // 8./9.
    const result = await acceptMidaoTravelerConfirmationDb({
      travelerUserId: traveler.id,
      rawToken,
      idempotencyKey,
      requestHash,
    });
    return jsonOk(result);
  } catch (error) {
    // route 標籤寫死字面量：不得由 request.url 組出（會把 raw token 送進 Sentry）。
    return handleRouteError(error, { route: 'v2/me/booking-confirmations/[token]/accept' });
  }
}
