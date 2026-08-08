/**
 * GET /api/v2/me/booking-confirmations/[token] — 旅客確認前預覽（#1759 Task 43a）
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-08-issue1759-task43-traveler-confirm-page-plan.md
 * §2 D2（與 accept 的權限差異）／§2 D3（三態判別式）／§4.2（邊界執行順序）。
 *
 * 與同目錄 accept/route.ts 的關鍵差異（D2，皆為刻意）：
 * - **不掛 CSRF**：GET 唯讀無副作用；加 CSRF 會讓首次載入必須先取 cookie，徒增失敗面。
 * - **不接受 Idempotency-Key**：唯讀無冪等語意。
 * - **掛 isMidaoBackendEnabled()（讀取閘）而非 mutations 閘**：否則「只開讀」的
 *   部署階段連預覽都會壞掉。
 * - **no-store + force-dynamic**：token 在 URL，不得進任何快取層。
 *
 * 三態語意：pending／expired／used 一律以 HTTP 200 回 `status` 判別式；
 * 只有「不存在」與「非本人」塌成 404（可區分即等於提供 token 存在性 oracle）。
 *
 * 誠實邊界：本 route 是**預測**，accept 才是權威——兩次呼叫之間存在 TOCTOU 窗口，
 * 前端不得假設 pending 就必然 accept 成功（仍須處理 accept 的 410／409）。
 */
import { isMidaoBackendEnabled } from '../../../../../../src/config/feature-flags.mjs';
import { jsonOk } from '../../../../../../src/lib/api-response.ts';
import { normalizeConfirmationRawToken } from '../../../../../../src/lib/midao/booking-confirmation.ts';
import { getMidaoTravelerConfirmationPreviewDb } from '../../../../../../src/lib/midao/db-midao-traveler-confirmation.mjs';
import { MidaoRouteError, handleMidaoRouteError as handleRouteError } from '../../../../../../src/lib/midao/route-errors.ts';
import { getTravelerIdentity } from '../../../../../../src/lib/v2/traveler-auth.ts';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    // 1. 讀取閘
    if (!isMidaoBackendEnabled()) {
      throw new MidaoRouteError('MIDAO_DISABLED', 'Midao backend is unavailable', 503);
    }

    // 2. 路徑 token 正規化（純字串檢查；失敗塌成 404，不揭露格式是否正確）。
    //    步驟 2 先於步驟 3 是刻意的：與 accept route 的既有順序一致，讓格式錯誤的
    //    token 在未登入時也回 404 而非 401（否則 401/404 的差異本身即成 oracle）。
    const rawToken = normalizeConfirmationRawToken((await context.params).token);

    // 3. 旅客身分
    const traveler = await getTravelerIdentity();
    if (!traveler?.id) {
      throw new MidaoRouteError('UNAUTHORIZED', 'Please login first', 401);
    }

    // 4. gateway（唯讀，不寫入、不取鎖、不呼叫 RPC）
    const preview = await getMidaoTravelerConfirmationPreviewDb({
      travelerUserId: traveler.id,
      rawToken,
    });

    // 5. token 在 URL：回應不得進任何快取層
    return jsonOk(preview, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    // route 標籤寫死字面量：不得由請求 URL 動態組出（會把 raw token 送進 Sentry）。
    return handleRouteError(error, { route: 'v2/me/booking-confirmations/[token]' });
  }
}
