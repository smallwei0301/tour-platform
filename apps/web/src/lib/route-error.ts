/**
 * v2 route 統一錯誤處理（健檢 v2 A5 / issue #1598）。
 *
 * 背景：v2 route 的 catch 過去多半只 `console.error`，serverless 上等同靜默——
 * 未過 `recordIncident` 的流程出錯沒有人會知道。本 helper 讓 catch 一行接上事故上報
 * （沿用 `recordIncident` 的 PII 遮罩＋Sentry＋Telegram），並回標準 `errorV2` 500。
 *
 * 用法：
 *   } catch (err) {
 *     return handleRouteError(err, { route: 'v2/bookings/checkout' });
 *   }
 *
 * 原則：
 * - client 回應預設為**通用**訊息，不外洩 err.message（避免內部細節外流）；需要時以
 *   opts.message 明確覆寫為安全文案。
 * - `recordIncident` 為縱深防線且 fire-and-forget：以**延遲 import**載入（避免把 Sentry/
 *   supabase 依賴鏈拉進所有 import 本 helper 的模組），且即使它拋錯也不得反噬 response。
 * - 金流 callback 類 route 的既有冪等語意由該 route 自理；本 helper 只處理「非預期例外」
 *   的上報與 500 回應，不改變任何成功/預期失敗路徑。
 */

// errorV2 shape 內聯（等同 src/lib/api.ts 的 errorV2）——避免跨模組 import 讓本 helper
// 可被輕量單測直接載入（api.ts 的 errorV2 仍是唯一對外契約來源）。
function errorV2Body(code: string, message: string) {
  return { success: false, error: { code, message } };
}

export interface RouteErrorOpts {
  /** 事故來源標籤，建議用 route 路徑（如 'v2/bookings/checkout'）。 */
  route: string;
  /** 事故分類（預設 'route_error'）。 */
  category?: string;
  /** client 錯誤碼（預設 'INTERNAL_ERROR'）。 */
  code?: string;
  /** client 可見訊息（預設通用文案，不外洩內部細節）。 */
  message?: string;
  /** HTTP 狀態（預設 500）。 */
  status?: number;
  /** 附加 metadata（會經 recordIncident 的 PII 遮罩）。 */
  metadata?: Record<string, unknown>;
}

/**
 * 只上報、不產生 response——給「回應 shape 非 errorV2」（如 ok/fail 契約）的 route 用：
 *   } catch (err) {
 *     await reportRouteError(err, { route: 'v2/guide/orders/redeem' });
 *     return Response.json(fail('INTERNAL_ERROR', '...'), { status: 500 });
 *   }
 * 永不拋錯（fire-and-forget 上報）。
 */
export async function reportRouteError(
  err: unknown,
  opts: { route: string; category?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  const errMessage = err instanceof Error ? err.message : String(err);
  const errName = err instanceof Error ? err.name : typeof err;
  try {
    const { recordIncident } = await import('./incidents');
    await recordIncident({
      severity: 'error',
      source: opts.route,
      category: opts.category ?? 'route_error',
      message: `${opts.route}: ${errMessage}`,
      metadata: { errorName: errName, ...(opts.metadata ?? {}) },
    });
  } catch {
    // recordIncident（或其依賴鏈）失敗不得反噬 route。
  }
}

export async function handleRouteError(err: unknown, opts: RouteErrorOpts): Promise<Response> {
  await reportRouteError(err, { route: opts.route, category: opts.category, metadata: opts.metadata });
  return Response.json(
    errorV2Body(opts.code ?? 'INTERNAL_ERROR', opts.message ?? '伺服器發生錯誤，請稍後再試'),
    { status: opts.status ?? 500 },
  );
}
