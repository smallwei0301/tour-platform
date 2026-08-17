import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';

/**
 * Creates, or safely reuses, the one pending ECPay attempt for an order.
 * The database uniqueness constraint is the concurrency authority.
 */
export async function upsertEcpayPaymentAttemptDb(input = {}) {
  const orderId = String(input?.orderId || '').trim();
  const merchantTradeNo = String(input?.merchantTradeNo || '').trim();
  const amountTwd = Number(input?.amountTwd || 0);

  if (!orderId) throw new Error('orderId is required');
  if (!merchantTradeNo) throw new Error('merchantTradeNo is required');
  if (!Number.isFinite(amountTwd) || amountTwd < 0) throw new Error('amountTwd must be a non-negative number');

  if (!hasSupabaseEnv()) {
    return { orderId, merchantTradeNo, status: 'pending', simulated: true };
  }

  const supabase = await getSupabase();
  const findExistingPending = async () => {
    const { data, error } = await supabase
      .from('payments')
      .select('id, order_id, merchant_trade_no, status')
      .eq('order_id', orderId)
      .eq('provider', 'ecpay')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message || 'failed to fetch existing pending payment attempt');
    return data;
  };
  const toResult = (row, reused) => ({
    id: row.id,
    orderId: row.order_id,
    merchantTradeNo: row.merchant_trade_no,
    status: row.status,
    reused,
  });

  const existingPending = await findExistingPending();
  if (existingPending) return toResult(existingPending, true);

  const { data, error } = await supabase
    .from('payments')
    .insert({
      order_id: orderId,
      provider: 'ecpay',
      merchant_trade_no: merchantTradeNo,
      amount_twd: Math.round(amountTwd),
      currency: 'TWD',
      status: 'pending',
      provider_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .select('id, order_id, merchant_trade_no, status')
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      const winner = await findExistingPending();
      if (winner) return toResult(winner, true);
    }
    throw new Error(error?.message || 'failed to create ecpay payment attempt');
  }
  return toResult(data, false);
}
