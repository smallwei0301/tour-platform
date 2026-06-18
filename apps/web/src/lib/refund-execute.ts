import { fail, ok } from './api.ts';

/**
 * REFUND_AUTO_EXECUTE — when true, the traveler-facing refund-requests POST
 * handler will automatically call executeRefund() immediately after the
 * refund_request row is created, without waiting for admin review.
 *
 * Default: false (safe — requires REFUND_AUTO_EXECUTE=true in env to enable)
 */
export const REFUND_AUTO_EXECUTE = process.env.REFUND_AUTO_EXECUTE === 'true';

export interface OrderForRefund {
  id: string;
  total_twd: number;
  trade_no?: string | null;
  merchant_trade_no?: string | null;
  ecpay_refund_trade_no?: string | null;
}

export interface RefundRequestParams {
  merchantTradeNo: string;
  tradeNo: string;
  totalAmount: number;
  reason?: string;
}

export interface AllRefundResult {
  ok: boolean;
  rtnCode: string;
  rtnMsg: string;
  ecpayTradeNo: string | null;
}

export interface UpdateOrderResult {
  error?: { message?: string } | null;
  data?: unknown[] | null;
  count?: number | null;
}

export type UpdateOrder = (orderId: string, payload: Record<string, unknown>) => Promise<UpdateOrderResult>;

export interface ExecuteRefundInput {
  order: OrderForRefund;
  body: Record<string, unknown>;
  requestAllRefund: (
    params: RefundRequestParams
  ) => Promise<AllRefundResult>;
  updateOrder: UpdateOrder;
  now?: () => string;
  /** Optional hook called after successful refund. Failures are non-blocking. */
  postRefundHook?: (orderId: string) => Promise<void>;
  /**
   * Optional partial-refund amount (TWD). When omitted/null/empty the order's
   * full `total_twd` is refunded (backward compatible). When provided it must be
   * a positive integer ≤ total_twd; the resolved amount is what gets sent to
   * ECPay (AllRefund TotalAmount) and recorded to operations_tracking.refund_amount_twd
   * (the field guide payout settlement actually reads).
   */
  refundAmount?: number | string | null;
  /**
   * Target order status for a PARTIAL refund (see resolvePartialRefundStatus).
   * The order must land on a settleable status so the non-refunded portion still
   * settles to the guide. Ignored for full refunds (those stay `refunded`).
   * When omitted, partial refunds fall back to `completed`.
   */
  partialTargetStatus?: string | null;
}

export interface RefundExecutionOutcome {
  status: number;
  body: ReturnType<typeof ok> | ReturnType<typeof fail>;
}

export interface ReversiblePayment {
  id: string;
  order_id: string;
  merchant_trade_no: string | null;
  trade_no: string | null;
  status: string | null;
  provider_status: string | null;
  amount_twd: number | null;
}

export interface ExecuteEcpayReversalInput {
  order: OrderForRefund;
  body: Record<string, unknown>;
  resolveLatestReversiblePayment: (orderId: string) => Promise<{ payment: ReversiblePayment | null; ambiguous: boolean }>;
  queryTradeInfo: (merchantTradeNo: string) => Promise<{ ok: boolean; rtnCode: string; rtnMsg: string; tradeStatus: string; tradeNo: string; raw: Record<string, string> }>;
  requestDoAction: (params: RefundRequestParams & { action: 'N' | 'R' }) => Promise<AllRefundResult>;
  persistReversal: (args: {
    orderId: string;
    paymentId: string;
    paymentMerchantTradeNo?: string | null;
    eventType: 'authorization_voided' | 'refunded';
    providerStatus: string;
    reversedTradeNo: string | null;
    refundedAmountTwd: number | null;
    /** true when a captured-card refund (Action=R) settled less than the order total */
    partial: boolean;
  }) => Promise<UpdateOrderResult>;
  recordIncident?: (args: { message: string; metadata?: Record<string, unknown> }) => void;
  /**
   * Optional partial-refund amount (TWD). Only honoured for captured-credit-card
   * refunds (Action=R); an authorization void (Action=N) is all-or-nothing, so a
   * partial amount on an un-captured authorization is rejected with
   * PARTIAL_REFUND_UNSUPPORTED. Omitted/null/empty → full `total_twd`.
   */
  refundAmount?: number | string | null;
}

export function getFailureResult(code: string, message: string): RefundExecutionOutcome {
  return {
    status: code.startsWith('DB_') || code === 'CASH_REFUND_PERSIST_FAILED'
      ? 500
      : 502,
    body: fail(code, message),
  };
}

function hasPersisted(updateResult: UpdateOrderResult): boolean {
  if (updateResult.error) {
    return false;
  }

  if (typeof updateResult.count === 'number' && updateResult.count < 1) {
    return false;
  }

  if (Array.isArray(updateResult.data) && updateResult.data.length === 0) {
    return false;
  }

  return true;
}

function failPersist(message: string) {
  return getFailureResult('DB_UPDATE_FAILED', `failed to persist refund result: ${message}`);
}

export interface ResolvedRefundAmount {
  amount: number;
  /** true when the resolved amount is strictly less than the order total */
  partial: boolean;
}

/**
 * Order statuses that let the guide-payout pipeline pick up an order — the
 * settlement sweep settles `completed` orders, and the guide dashboard counts
 * `paid`/`confirmed`/`completed` toward GMV. A PARTIALLY-refunded order MUST
 * land on one of these so the non-refunded portion still settles
 * (settlement-rules §4「扣除已退款部分後」/ #847). Setting it to `refunded`
 * (as a full refund does) excludes the whole order from settlement.
 */
export const SETTLEABLE_ORDER_STATUSES = ['paid', 'confirmed', 'completed'] as const;

/**
 * Resolve the order status a PARTIALLY-refunded order should land on.
 *
 * A partial refund keeps the booking active (the traveler still attends, the
 * guide is still owed the non-refunded portion), so the order must return to a
 * settleable status — its pre-refund status, recorded in audit_logs as
 * `previousOrderStatus` when the order entered `refund_pending`. When that prior
 * status is unknown or itself non-settleable, fall back to `completed`: this
 * keeps the order in the settlement pool while the sweep's T+7 time gate still
 * guards against premature payout.
 *
 * Full refunds do NOT use this — they correctly stay `refunded` (effective
 * GMV is 0, so there is nothing to settle).
 */
export function resolvePartialRefundStatus(previousStatus?: string | null): string {
  if (previousStatus && (SETTLEABLE_ORDER_STATUSES as readonly string[]).includes(previousStatus)) {
    return previousStatus;
  }
  return 'completed';
}

export interface RefundAmountError {
  error: { code: string; message: string };
}

/**
 * Normalise the requested refund amount against the order total.
 *
 * - undefined / null / '' → full refund (`{ amount: total, partial: false }`)
 * - positive integer ≤ total → partial/full refund as requested
 * - anything else → `{ error }` (caller maps to a 400 response)
 *
 * Amounts must be whole TWD (ECPay rejects fractional amounts).
 */
export function resolveRefundAmount(
  requested: unknown,
  totalAmount: number,
): ResolvedRefundAmount | RefundAmountError {
  if (requested === undefined || requested === null || requested === '') {
    return { amount: totalAmount, partial: false };
  }

  const value = typeof requested === 'number' ? requested : Number(String(requested).trim());

  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return {
      error: {
        code: 'INVALID_REFUND_AMOUNT',
        message: 'refundAmount must be a positive integer (TWD)',
      },
    };
  }

  if (value > totalAmount) {
    return {
      error: {
        code: 'REFUND_AMOUNT_EXCEEDS_TOTAL',
        message: `refundAmount ${value} exceeds order total ${totalAmount}`,
      },
    };
  }

  return { amount: value, partial: value < totalAmount };
}

function isRefundAmountError(
  resolved: ResolvedRefundAmount | RefundAmountError,
): resolved is RefundAmountError {
  return 'error' in resolved;
}

export async function executeRefund(input: ExecuteRefundInput): Promise<RefundExecutionOutcome> {
  const { order, body, requestAllRefund, updateOrder, now = () => new Date().toISOString(), postRefundHook } = input;

  if (order.ecpay_refund_trade_no) {
    return {
      status: 200,
      body: ok({
        alreadyRefunded: true,
        ecpayRefundTradeNo: order.ecpay_refund_trade_no,
      }),
    };
  }

  const resolvedAmount = resolveRefundAmount(input.refundAmount, order.total_twd);
  if (isRefundAmountError(resolvedAmount)) {
    return { status: 400, body: fail(resolvedAmount.error.code, resolvedAmount.error.message) };
  }
  const refundAmount = resolvedAmount.amount;

  if (!order.trade_no) {
    const reason = String(body?.reason ?? '').trim();
    if (!reason) {
      return {
        status: 400,
        body: fail('REASON_REQUIRED', 'reason required for cash orders'),
      };
    }

    // orders 真實 schema 只有 status + payment_status；refunded_amount / refunded_at /
    // ecpay_refund_trade_no 皆不存在（無 migration 建立、亦無讀取點），寫入會 500。
    // 退款明細（時間/金額/trade_no）落在 payments / payment_events / operations_tracking。
    // 部分退款：保持「可結算」狀態（還原退款前狀態），讓未退部分仍撥款給導遊；
    // 全額退款：維持 refunded（effective=0，本就不撥款）。
    const { error, data, count } = await updateOrder(order.id, {
      status: resolvedAmount.partial ? resolvePartialRefundStatus(input.partialTargetStatus) : 'refunded',
      payment_status: resolvedAmount.partial ? 'partially_refunded' : 'refunded',
      updated_at: now(),
    });

    if (!hasPersisted({ error, data, count })) {
      return failPersist(error?.message ?? 'no rows updated');
    }

    // Attempt settlement reversal (non-blocking: failure does not affect refund outcome)
    if (postRefundHook) {
      try {
        await postRefundHook(order.id);
      } catch (reversalErr) {
        console.warn('[refund-execute] settlement reversal failed (cash):', reversalErr);
      }
    }

    return {
      status: 200,
      body: ok({
        refunded: true,
        cashOrder: true,
        refundedAmount: refundAmount,
        partial: resolvedAmount.partial,
      }),
    };
  }

  let result;
  try {
    result = await requestAllRefund({
      merchantTradeNo: order.merchant_trade_no ?? order.id,
      tradeNo: order.trade_no,
      totalAmount: refundAmount,
      reason: String(body?.reason ?? '').trim() || undefined,
    });
  } catch (err) {
    return getFailureResult(
      'ECPAY_REFUND_FAILED',
      err instanceof Error ? err.message : 'failed to request ECPay refund'
    );
  }

  if (!result.ok) {
    return {
      status: 502,
      body: fail('ECPAY_REFUND_FAILED', result.rtnMsg),
    };
  }

  const ecpayTradeNo =
    result.ecpayTradeNo || order.ecpay_refund_trade_no || order.merchant_trade_no || order.id;
  // 部分退款保持可結算狀態（見上方現金路徑說明）；全額退款維持 refunded。
  const { error, data, count } = await updateOrder(order.id, {
    status: resolvedAmount.partial ? resolvePartialRefundStatus(input.partialTargetStatus) : 'refunded',
    payment_status: resolvedAmount.partial ? 'partially_refunded' : 'refunded',
    updated_at: now(),
  });

  if (!hasPersisted({ error, data, count })) {
    return failPersist(error?.message ?? 'no rows updated');
  }

  // Attempt settlement reversal (non-blocking: failure does not affect refund outcome)
  if (postRefundHook) {
    try {
      await postRefundHook(order.id);
    } catch (reversalErr) {
      console.warn('[refund-execute] settlement reversal failed (ecpay):', reversalErr);
    }
  }

  return {
    status: 200,
    body: ok({
      refunded: true,
      rtnCode: result.rtnCode,
      ecpayRefundTradeNo: ecpayTradeNo,
      refundedAmount: refundAmount,
      partial: resolvedAmount.partial,
    }),
  };
}

function toPositiveAmount(rawValue: string | undefined): number | null {
  if (typeof rawValue !== 'string') return null;
  const normalized = rawValue.trim().replace(/,/g, '');
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return amount > 0 ? amount : 0;
}

function hasNonEmpty(rawValue: string | undefined): boolean {
  return typeof rawValue === 'string' && rawValue.trim().length > 0;
}

function resolveEcpayReversalAction(query: { tradeStatus: string; raw: Record<string, string> }): 'N' | 'R' | null {
  const tradeStatus = String(query.tradeStatus || '').trim();
  const raw = query.raw || {};
  const paymentType = String(raw.PaymentType || '').toLowerCase();

  if (paymentType && !paymentType.includes('credit')) {
    return null;
  }

  if (tradeStatus === '0') return 'N';

  if (tradeStatus !== '1') {
    return null;
  }

  const capturedAmount = [
    toPositiveAmount(raw.CaptureAMT),
    toPositiveAmount(raw.CloseAMT),
    toPositiveAmount(raw.ChargedAmt),
  ].find((value) => typeof value === 'number' && value > 0);

  if (typeof capturedAmount === 'number' && capturedAmount > 0) {
    return 'R';
  }

  const authorizationHints = [
    hasNonEmpty(raw.AuthCode),
    hasNonEmpty(raw.AuthCodeNo),
    hasNonEmpty(raw.gwsr),
    hasNonEmpty(raw.ProcessDate),
  ];

  if (authorizationHints.some(Boolean)) {
    return 'N';
  }

  return null;
}

export async function executeEcpayReversal(input: ExecuteEcpayReversalInput): Promise<RefundExecutionOutcome> {
  const { order, body, resolveLatestReversiblePayment, queryTradeInfo, requestDoAction, persistReversal, recordIncident } = input;
  const reason = String(body?.reason ?? '').trim() || undefined;

  const resolvedAmount = resolveRefundAmount(input.refundAmount, order.total_twd);
  if (isRefundAmountError(resolvedAmount)) {
    return { status: 400, body: fail(resolvedAmount.error.code, resolvedAmount.error.message) };
  }
  const refundAmount = resolvedAmount.amount;

  const resolved = await resolveLatestReversiblePayment(order.id);
  if (resolved.ambiguous || !resolved.payment) {
    recordIncident?.({
      message: 'refund-execute blocked before provider call: latest reversible payment missing/ambiguous',
      metadata: { orderId: order.id, reason: resolved.ambiguous ? 'ambiguous_latest_payment' : 'missing_latest_payment' },
    });
    return { status: 409, body: fail('PAYMENT_NOT_REVERSIBLE', 'latest reversible payment is missing or ambiguous') };
  }

  const payment = resolved.payment;
  if (!payment.merchant_trade_no) {
    return { status: 409, body: fail('PAYMENT_NOT_REVERSIBLE', 'merchant_trade_no missing on latest reversible payment') };
  }

  const query = await queryTradeInfo(payment.merchant_trade_no);
  if (!query.ok) {
    recordIncident?.({
      message: 'refund-execute blocked: QueryTradeInfo failed',
      metadata: { orderId: order.id, merchantTradeNo: payment.merchant_trade_no, rtnCode: query.rtnCode, rtnMsg: query.rtnMsg },
    });
    return { status: 502, body: fail('ECPAY_QUERY_FAILED', 'failed to query provider state before reversal') };
  }

  const action = resolveEcpayReversalAction({ tradeStatus: query.tradeStatus, raw: query.raw || {} });
  if (!action) {
    recordIncident?.({
      message: 'refund-execute blocked: unknown or inconsistent provider state',
      metadata: {
        orderId: order.id,
        merchantTradeNo: payment.merchant_trade_no,
        tradeStatus: query.tradeStatus,
        paymentType: query.raw?.PaymentType || null,
      },
    });
    return { status: 409, body: fail('ECPAY_STATE_UNKNOWN', 'provider state unknown/inconsistent; reversal blocked') };
  }

  // Action=N voids the full authorization (all-or-nothing); a partial amount only
  // makes sense for a captured-card refund (Action=R). Block the impossible combo.
  if (resolvedAmount.partial && action === 'N') {
    recordIncident?.({
      message: 'refund-execute blocked: partial refund requested on un-captured authorization (void only)',
      metadata: { orderId: order.id, refundAmount, totalAmount: order.total_twd },
    });
    return {
      status: 409,
      body: fail(
        'PARTIAL_REFUND_UNSUPPORTED',
        'authorization not captured; only a full void is possible (partial refund requires a captured payment)',
      ),
    };
  }

  const reversalResult = await requestDoAction({
    merchantTradeNo: payment.merchant_trade_no,
    tradeNo: query.tradeNo || payment.trade_no || order.trade_no || '',
    totalAmount: refundAmount,
    reason,
    action,
  });

  if (!reversalResult.ok) {
    recordIncident?.({
      message: 'refund-execute provider reversal failed',
      metadata: { orderId: order.id, action, rtnCode: reversalResult.rtnCode, rtnMsg: reversalResult.rtnMsg },
    });
    return { status: 502, body: fail('ECPAY_REVERSAL_FAILED', 'provider reversal failed') };
  }

  const eventType = action === 'N' ? 'authorization_voided' : 'refunded';
  const persist = await persistReversal({
    orderId: order.id,
    paymentId: payment.id,
    paymentMerchantTradeNo: payment.merchant_trade_no,
    eventType,
    providerStatus: query.tradeStatus || payment.provider_status || '',
    reversedTradeNo: reversalResult.ecpayTradeNo || query.tradeNo || payment.trade_no,
    refundedAmountTwd: action === 'R' ? refundAmount : null,
    partial: action === 'R' ? resolvedAmount.partial : false,
  });

  if (!hasPersisted(persist)) {
    return failPersist(persist.error?.message ?? 'no rows updated');
  }

  return {
    status: 200,
    body: ok({
      reversed: true,
      mode: eventType,
      rtnCode: reversalResult.rtnCode,
      refundedAmount: action === 'R' ? refundAmount : null,
      partial: action === 'R' ? resolvedAmount.partial : false,
    }),
  };
}
