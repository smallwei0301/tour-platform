import { getSupabase, hasSupabaseEnv, processPaymentCallbackDb } from './db.mjs';
import { queryEcpayTradeInfo } from './ecpay';
import { recordIncident } from './incidents';

type CandidatePayment = {
  id: string;
  order_id: string;
  merchant_trade_no: string;
  trade_no: string | null;
  status: string | null;
  provider_status: string | null;
};

export type ReconcileOneResult = {
  paymentId: string;
  orderId: string;
  merchantTradeNo: string;
  outcome: 'paid_reconciled' | 'noop_already_paid' | 'noop_unpaid_or_unknown' | 'query_failed';
  diagnostics: Record<string, string | null>;
};

function sanitizeDiagnostics(input: Record<string, unknown>) {
  const result: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined) {
      result[k] = null;
      continue;
    }
    const text = String(v).replace(/[\r\n\t]+/g, ' ').trim();
    result[k] = text ? text.slice(0, 160) : null;
  }
  return result;
}

function isProviderPaid(query: { ok: boolean; rtnCode: string; tradeStatus: string }) {
  if (!query.ok) return false;
  const rtnCode = String(query.rtnCode || '').trim();
  const tradeStatus = String(query.tradeStatus || '').trim();
  return rtnCode === '1' && tradeStatus === '1';
}

async function upsertReconciledPaidEvent(supabase: any, payment: CandidatePayment) {
  let existingQuery = supabase
    .from('payment_events')
    .select('id')
    .eq('provider', 'ecpay')
    .eq('event_type', 'provider_reconciled_paid')
    .eq('order_id', payment.order_id)
    .eq('merchant_trade_no', payment.merchant_trade_no)
    .limit(1);

  existingQuery = payment.trade_no
    ? existingQuery.eq('trade_no', payment.trade_no)
    : existingQuery.is('trade_no', null);

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) throw new Error(existingError.message || 'failed to query provider_reconciled_paid');
  if (existing) return;

  const { error: insertError } = await supabase.from('payment_events').insert({
    payment_id: payment.id,
    order_id: payment.order_id,
    provider: 'ecpay',
    merchant_trade_no: payment.merchant_trade_no,
    trade_no: payment.trade_no,
    event_type: 'provider_reconciled_paid',
    payload: {
      source: 'reconcileEcpayPendingPayments',
      merchantTradeNo: payment.merchant_trade_no,
      tradeNo: payment.trade_no,
    },
  });

  if (insertError && insertError.code !== '23505') {
    throw new Error(insertError.message || 'failed to insert provider_reconciled_paid');
  }
}

export async function reconcileEcpayPendingPayments(limit = 20): Promise<ReconcileOneResult[]> {
  if (!hasSupabaseEnv()) {
    return [];
  }

  const supabase = await getSupabase();
  const { data: candidates, error: queryError } = await supabase
    .from('payments')
    .select('id, order_id, merchant_trade_no, trade_no, status, provider_status')
    .eq('provider', 'ecpay')
    .in('status', ['pending', 'authorized'])
    .not('merchant_trade_no', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(Math.max(1, Math.min(100, Number(limit) || 20)));

  if (queryError) {
    throw new Error(queryError.message || 'failed to query pending ecpay payments');
  }

  const results: ReconcileOneResult[] = [];

  for (const payment of (candidates || []) as CandidatePayment[]) {
    const base = {
      paymentId: payment.id,
      orderId: payment.order_id,
      merchantTradeNo: payment.merchant_trade_no,
    };

    try {
      const query = await queryEcpayTradeInfo({ merchantTradeNo: payment.merchant_trade_no });

      const sanitizedPayload = {
        source: 'query_trade_info',
        ...query.sanitized,
      };

      await supabase
        .from('payments')
        .update({
          provider_status: query.tradeStatus || payment.provider_status || 'pending',
          trade_no: query.tradeNo || payment.trade_no,
          last_provider_query_payload: sanitizedPayload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      if (!isProviderPaid(query)) {
        results.push({
          ...base,
          outcome: 'noop_unpaid_or_unknown',
          diagnostics: sanitizeDiagnostics({ rtnCode: query.rtnCode, tradeStatus: query.tradeStatus, rtnMsg: query.rtnMsg }),
        });
        continue;
      }

      if (payment.status === 'paid') {
        await upsertReconciledPaidEvent(supabase, {
          ...payment,
          trade_no: query.tradeNo || payment.trade_no,
          status: 'paid',
        });
        results.push({
          ...base,
          outcome: 'noop_already_paid',
          diagnostics: sanitizeDiagnostics({ rtnCode: query.rtnCode, tradeStatus: query.tradeStatus }),
        });
        continue;
      }

      await processPaymentCallbackDb({
        orderId: payment.order_id,
        merchantTradeNo: payment.merchant_trade_no,
        tradeNo: query.tradeNo || payment.trade_no,
        RtnCode: '1',
        RtnMsg: 'reconciled_paid',
        source: 'provider_query_reconciliation',
      });

      await upsertReconciledPaidEvent(supabase, {
        ...payment,
        trade_no: query.tradeNo || payment.trade_no,
        status: 'paid',
      });

      results.push({
        ...base,
        outcome: 'paid_reconciled',
        diagnostics: sanitizeDiagnostics({ rtnCode: query.rtnCode, tradeStatus: query.tradeStatus }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'query_failed';
      void recordIncident({
        source: 'ecpay_reconciliation',
        severity: 'warn',
        category: 'payment',
        message: 'ECPay QueryTradeInfo reconciliation failed',
        metadata: {
          orderId: payment.order_id,
          merchantTradeNo: payment.merchant_trade_no,
          reason: 'query_trade_info_failed',
          error: sanitizeDiagnostics({ message }).message,
        },
      });
      results.push({
        ...base,
        outcome: 'query_failed',
        diagnostics: sanitizeDiagnostics({ message }),
      });
    }
  }

  return results;
}
