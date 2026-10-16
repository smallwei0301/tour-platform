import { randomUUID } from 'node:crypto';
import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';
import { getMaterializedOrderDetailForPayment } from './db-payment-detail.mjs';
import { isMaterializedOrderReadyForPayment } from '../ecpay-create-orchestration.mjs';
import { canCheckoutTravelerConfirmation } from '../booking-type-flow.mjs';

const memoryAttempts = new Map();
export function __resetPaymentAdmissionForTest() { memoryAttempts.clear(); }
export function __seedPaymentAdmissionAttemptsForTest(orderId, attempts) { memoryAttempts.set(orderId, structuredClone(attempts)); }

const hold = (code, row) => ({ outcome: 'hold', code, ...(row ? { id: row.id, provider: row.provider } : {}) });
const result = (row, reused) => ({
  outcome: reused ? 'reuse' : 'create', id: row.id, orderId: row.order_id, provider: row.provider,
  merchantTradeNo: row.merchant_trade_no || row.trade_no, status: row.status, amountTwd: row.amount_twd, reused,
});

/** No-Supabase simulation only. It does not provide cross-process or database locking. */
async function simulateAdmission(orderId, provider, merchantTradeNo) {
  const order = await getMaterializedOrderDetailForPayment(orderId);
  if (!order || !Number.isSafeInteger(order.totalTwd) || !Array.isArray(order.items)
    || order.items.some((item) => !Number.isSafeInteger(item?.subtotal_amount))
    || !isMaterializedOrderReadyForPayment(order)) return hold('ORDER_NOT_MATERIALIZED');
  if (!canCheckoutTravelerConfirmation(order).allowed) return hold('TRAVELER_CONFIRMATION_REQUIRED');
  const deadline = order.paymentDeadlineAt == null ? null : Date.parse(order.paymentDeadlineAt);
  if (deadline != null && (!Number.isFinite(deadline) || deadline <= Date.now())) return hold('ORDER_PAYMENT_EXPIRED');

  // No await between inspection and mutation: this models only one process.
  const rows = memoryAttempts.get(orderId) || [];
  if (rows.length > 1) return hold('PAYMENT_RECONCILIATION_REQUIRED');
  const existing = rows[0];
  if (existing) {
    const trade = existing.provider === 'ecpay' ? existing.merchant_trade_no : existing.merchant_trade_no || existing.trade_no;
    if (existing.status !== 'pending' || typeof trade !== 'string' || !/^[A-Za-z0-9]{1,20}$/u.test(trade)
      || !existing.id || existing.amount_twd !== order.totalTwd || existing.paid_at != null
      || (Object.hasOwn(existing, 'captured_amount_twd') && existing.captured_amount_twd !== 0)
      || ![null, undefined, 'pending'].includes(existing.provider_status) || existing.last_provider_query_payload != null) {
      return hold('PAYMENT_RECONCILIATION_REQUIRED', existing);
    }
    if (provider === 'manual' && existing.provider === 'transfer') return hold('TRANSFER_RECONCILIATION_REQUIRED', existing);
    if (existing.provider !== provider) return hold('PAYMENT_PROVIDER_CONFLICT', existing);
    if (provider === 'manual') return hold('MANUAL_SETTLEMENT_REQUIRED', existing);
    return { ...result(existing, true), simulated: true };
  }
  // Manual payment must include paid/event/booking/order settlement in the same
  // transaction. This initiation kernel must never reserve or mark it paid alone.
  if (provider === 'manual') return hold('MANUAL_SETTLEMENT_REQUIRED');
  const row = { id: randomUUID(), order_id: orderId, provider, status: 'pending', amount_twd: order.totalTwd,
    merchant_trade_no: merchantTradeNo, trade_no: provider === 'transfer' ? merchantTradeNo : null, provider_status: 'pending' };
  memoryAttempts.set(orderId, [row]);
  return { ...result(row, false), simulated: true };
}

/**
 * Atomic database admission contract. No SELECT/INSERT fallback is allowed after
 * an RPC error. Callers may launch a provider only for create/reuse outcomes.
 * This kernel is not wired to current routes until the migration/runtime gates
 * and the manual/legacy/callback integration are independently verified.
 */
export async function admitInitialPaymentAttemptDb(input = {}, injectedSupabase) {
  const orderId = String(input.orderId || '').trim();
  const provider = String(input.provider || '').trim();
  const merchantTradeNo = String(input.merchantTradeNo || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(orderId)
    || !['ecpay', 'transfer', 'manual'].includes(provider) || !/^[A-Za-z0-9]{1,20}$/u.test(merchantTradeNo)) {
    throw new Error('invalid initial payment admission request');
  }
  if (!injectedSupabase && !hasSupabaseEnv()) {
    return { ...await simulateAdmission(orderId, provider, merchantTradeNo), simulated: true };
  }
  const supabase = injectedSupabase || await getSupabase();
  const { data, error } = await supabase.rpc('fn_admit_initial_payment_attempt', {
    p_order_id: orderId, p_provider: provider, p_merchant_trade_no: merchantTradeNo,
  });
  if (error) {
    const failure = new Error('initial payment admission RPC failed');
    failure.code = error.code;
    throw failure;
  }
  if (!data || !['create', 'reuse', 'hold'].includes(data.outcome)
    || (provider === 'manual' && data.outcome !== 'hold')
    || (data.outcome === 'hold' ? typeof data.code !== 'string' :
      !data.id || data.orderId !== orderId || data.provider !== provider || data.status !== 'pending'
      || typeof data.merchantTradeNo !== 'string' || !/^[A-Za-z0-9]{1,20}$/u.test(data.merchantTradeNo)
      || !Number.isSafeInteger(data.amountTwd) || data.amountTwd < 0
      || data.reused !== (data.outcome === 'reuse'))) {
    throw new Error('invalid initial payment admission RPC response');
  }
  return data;
}
