import { fail, ok } from './api.ts';

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
}

export interface RefundExecutionOutcome {
  status: number;
  body: ReturnType<typeof ok> | ReturnType<typeof fail>;
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
  const { order, body, requestAllRefund, updateOrder, now = () => new Date().toISOString() } = input;

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

  return {
    status: 200,
    body: ok({ refunded: true, rtnCode: result.rtnCode, ecpayRefundTradeNo: ecpayTradeNo }),
  };
}
