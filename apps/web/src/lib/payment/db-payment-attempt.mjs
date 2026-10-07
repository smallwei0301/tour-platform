import { hasSupabaseEnv } from '../supabase-env.mjs';
import { admitInitialPaymentAttemptDb } from './db-payment-admission.mjs';

const memoryPendingAttempts = new Map();

export function __resetEcpayPaymentAttemptsForTest() {
  memoryPendingAttempts.clear();
}

/**
 * Creates, or safely reuses, the one pending ECPay attempt for an order.
 * The order-locked admission RPC is the database concurrency authority.
 * Both HTTP entry points use this adapter; no SELECT/INSERT fallback is safe.
 */
export async function upsertEcpayPaymentAttemptDb(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  const merchantTradeNo = String(input?.merchantTradeNo || '').trim();
  const amountTwd = Number(input?.amountTwd || 0);

  if (!orderId) throw new Error('orderId is required');
  if (!merchantTradeNo) throw new Error('merchantTradeNo is required');
  if (!Number.isFinite(amountTwd) || amountTwd < 0) throw new Error('amountTwd must be a non-negative number');

  if (!hasSupabaseEnv()) {
    const existing = memoryPendingAttempts.get(orderId);
    if (existing) return { ...existing, reused: true };
    const created = {
      id: `memory-ecpay-${memoryPendingAttempts.size + 1}`,
      orderId,
      merchantTradeNo,
      status: 'pending',
      reused: false,
      simulated: true,
    };
    memoryPendingAttempts.set(orderId, created);
    return created;
  }

  const admitted = await admitInitialPaymentAttemptDb({ orderId, provider: 'ecpay', merchantTradeNo });
  if (admitted.outcome === 'hold') {
    const failure = new Error('initial payment admission is on hold');
    failure.code = admitted.code;
    throw failure;
  }
  // HTTP callers use a prior order read to build the form. Never launch it with
  // an amount that differs from the transaction's locked, reconciled amount.
  if (admitted.amountTwd !== amountTwd) {
    const failure = new Error('payment amount changed during admission');
    failure.code = 'PAYMENT_AMOUNT_CHANGED';
    throw failure;
  }
  return {
    id: admitted.id, orderId: admitted.orderId,
    merchantTradeNo: admitted.merchantTradeNo, status: admitted.status,
    reused: admitted.reused,
  };
}
