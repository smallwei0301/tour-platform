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
  }) => Promise<UpdateOrderResult>;
  recordIncident?: (args: { message: string; metadata?: Record<string, unknown> }) => void;
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

  if (!order.trade_no) {
    const reason = String(body?.reason ?? '').trim();
    if (!reason) {
      return {
        status: 400,
        body: fail('REASON_REQUIRED', 'reason required for cash orders'),
      };
    }

    const { error, data, count } = await updateOrder(order.id, {
      status: 'refunded',
      refunded_amount: order.total_twd,
      refunded_at: now(),
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
      }),
    };
  }

  let result;
  try {
    result = await requestAllRefund({
      merchantTradeNo: order.merchant_trade_no ?? order.id,
      tradeNo: order.trade_no,
      totalAmount: order.total_twd,
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
  const { error, data, count } = await updateOrder(order.id, {
    status: 'refunded',
    refunded_amount: order.total_twd,
    refunded_at: now(),
    ecpay_refund_trade_no: ecpayTradeNo,
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
    body: ok({ refunded: true, rtnCode: result.rtnCode, ecpayRefundTradeNo: ecpayTradeNo }),
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

  const reversalResult = await requestDoAction({
    merchantTradeNo: payment.merchant_trade_no,
    tradeNo: query.tradeNo || payment.trade_no || order.trade_no || '',
    totalAmount: order.total_twd,
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
    refundedAmountTwd: action === 'R' ? order.total_twd : null,
  });

  if (!hasPersisted(persist)) {
    return failPersist(persist.error?.message ?? 'no rows updated');
  }

  return {
    status: 200,
    body: ok({ reversed: true, mode: eventType, rtnCode: reversalResult.rtnCode }),
  };
}
