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

/**
 * #1925：v2 route 回給 client 的錯誤訊息一律「白名單或通用文案」，不得把 DB／外部服務的
 * `error.message` 原樣外洩。
 *
 * - `pickSafeMessage`：只有 err.message 完整符合 `allow` 內「我方自己定義的業務訊息」樣式時才原樣回傳，
 *   其餘（含 PostgREST／pg 錯誤、未知例外、非 Error）一律換成 `fallback`。
 * - `getErrorText`：取原始訊息**僅供 route 內部分類**（例如 `includes('not found')` 決定 HTTP 狀態）；
 *   結果不得放進 response（source guard `issue1925-v2-no-db-error-leak-guard` 守門）。
 */
export const GENERIC_SERVER_ERROR_MESSAGE = '伺服器發生錯誤，請稍後再試';

export function getErrorText(err: unknown): string {
  return err instanceof Error ? err.message : '';
}

export function isDomainError(err: unknown, allow: ReadonlyArray<RegExp>): boolean {
  const text = getErrorText(err);
  return text !== '' && allow.some((re) => re.test(text));
}

export function pickSafeMessage(
  err: unknown,
  allow: ReadonlyArray<RegExp>,
  fallback: string = GENERIC_SERVER_ERROR_MESSAGE,
): string {
  return isDomainError(err, allow) ? getErrorText(err) : fallback;
}

/**
 * 訂單／退款／出款相關 gateway（db.mjs、admin.mjs、db-payouts.mjs、fn_confirm_payout_atomic）
 * 以字面值 `throw new Error('…')` 丟出的業務訊息。來源逐條追到 throw 點確認為我方定義；
 * 樣式一律錨定整句（^…$），DB 回傳的錯誤字串（relation／column／constraint…）不會命中。
 */
export const ORDER_DOMAIN_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /^[A-Za-z]+ (?:is )?required$/,
  /^(?:order|refund request|schedule|target schedule|experience|payout|Activity|activity) not found$/,
  /^invalid (?:order status|refund action|exception action|review action|status)$/,
  /^(?:peopleCount must be a positive integer|newCapacity must be positive integer|newCapacity cannot be less than bookedCount)$/,
  /^(?:target schedule not enough seats|not enough seats|schedule is not open|refund already requested)$/,
  /^capacity insufficient: capacity=\d+ booked=\d+ delta=-?\d+$/,
  /^(?:order_edit_locked|order_cancel_locked|manual_status_change_blocked):\w+$/,
  /^(?:order cannot request refund in current status|only pending_payment orders can be cancelled by user|refund create failed)$/,
  /^payout already \w+$/,
  /^guide balance is empty — nothing to pay out$/,
  /^guide balance row not found for guide [0-9a-fA-F-]+$/,
  /^insufficient guide balance: have -?\d+, need -?\d+$/,
  /^SETTLEMENT_RPC_NOT_DEPLOYED: /,
];
