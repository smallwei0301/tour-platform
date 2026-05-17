#!/usr/bin/env node
/**
 * Cron: scan refund_pending orders > N min stale, query ECPay, sync status.
 * Issue #479 — refund reconciliation cron job
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ECPAY_MERCHANT_ID, ECPAY_HASH_KEY, ECPAY_HASH_IV
 *
 * Optional env:
 *   ECPAY_ENV=production          (default: sandbox)
 *   TELEGRAM_BOT_TOKEN            (alert on threshold exceeded)
 *   TELEGRAM_CHAT_ID
 *   REFUND_RETRY_ALERT_THRESHOLD  (default: 5)
 *   REFUND_RECONCILE_STALE_MINUTES (default: 15)
 */

import { createClient } from '@supabase/supabase-js';
import { queryTradeInfo } from '../../apps/web/src/lib/ecpay-query.mjs';
import { processRefundCallbackDb } from '../../apps/web/src/lib/db.mjs';

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ECPAY_MERCHANT_ID = process.env.ECPAY_MERCHANT_ID;
const ECPAY_HASH_KEY = process.env.ECPAY_HASH_KEY;
const ECPAY_HASH_IV = process.env.ECPAY_HASH_IV;

// Soft-launch gate: skip reconciliation unless explicitly enabled.
// Set REFUND_RECONCILE_ENABLED=true in GitHub Actions secrets when production ECPay is ready.
if (process.env.REFUND_RECONCILE_ENABLED !== 'true') {
  console.log(JSON.stringify({ status: 'HOLD', reason: 'REFUND_RECONCILE_ENABLED not set — skipping until soft-launch enabled', scanned: 0, synced: 0, retried: 0, alerted: 0, errors: 0 }));
  process.exit(0);
}

const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ECPAY_MERCHANT_ID', 'ECPAY_HASH_KEY', 'ECPAY_HASH_IV']
  .filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error('[refund-reconcile] Missing required env vars:', missing.join(', '));
  process.exit(1);
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';
const REFUND_RETRY_ALERT_THRESHOLD = Number(process.env.REFUND_RETRY_ALERT_THRESHOLD ?? '5');
const REFUND_RECONCILE_STALE_MINUTES = Number(process.env.REFUND_RECONCILE_STALE_MINUTES ?? '15');
const IS_SANDBOX = (process.env.ECPAY_ENV ?? 'sandbox') !== 'production';

// ---------------------------------------------------------------------------
// Telegram helper
// ---------------------------------------------------------------------------
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch (err) {
    console.warn('[refund-reconcile] Telegram send failed:', err?.message ?? err);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const staleInterval = `${REFUND_RECONCILE_STALE_MINUTES} minutes`;

// Query stale refund_pending orders joined with payments for trade info
const { data: staleOrders, error: queryErr } = await supabase
  .from('orders')
  .select(`
    id,
    status,
    updated_at,
    payments ( merchant_trade_no, trade_no, status ),
    refund_requests ( id, retry_count, last_error, status )
  `)
  .eq('status', 'refund_pending')
  .lt('updated_at', new Date(Date.now() - REFUND_RECONCILE_STALE_MINUTES * 60 * 1000).toISOString())
  .order('updated_at', { ascending: true });

if (queryErr) {
  console.error('[refund-reconcile] Failed to query stale orders:', queryErr.message);
  process.exit(1);
}

const orders = staleOrders ?? [];
console.log(`[refund-reconcile] Found ${orders.length} stale refund_pending order(s) (stale > ${staleInterval})`);

const summary = {
  total: orders.length,
  synced: 0,
  alreadyRefunded: 0,
  retried: 0,
  alerted: 0,
  errors: [],
};

for (const order of orders) {
  const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
  const refundReq = Array.isArray(order.refund_requests)
    ? order.refund_requests.find((r) => r.status === 'approved') ?? order.refund_requests[0]
    : order.refund_requests;

  if (!payment?.merchant_trade_no) {
    console.warn(`[refund-reconcile] Order ${order.id}: no merchant_trade_no — skipping`);
    summary.errors.push({ orderId: order.id, error: 'no merchant_trade_no' });
    continue;
  }

  let tradeResult;
  try {
    tradeResult = await queryTradeInfo({
      merchantTradeNo: payment.merchant_trade_no,
      merchantId: ECPAY_MERCHANT_ID,
      hashKey: ECPAY_HASH_KEY,
      hashIV: ECPAY_HASH_IV,
      isSandbox: IS_SANDBOX,
    });
  } catch (err) {
    console.error(`[refund-reconcile] Order ${order.id}: queryTradeInfo threw:`, err?.message ?? err);
    summary.errors.push({ orderId: order.id, error: err?.message ?? String(err) });
    continue;
  }

  // ECPay TradeStatus === '2' means the refund has completed on ECPay's side
  if (tradeResult.tradeStatus === '2') {
    try {
      const result = await processRefundCallbackDb(supabase, {
        merchantTradeNo: payment.merchant_trade_no,
        tradeNo: tradeResult.tradeNo || payment.trade_no || '',
        rawPayload: tradeResult.raw,
      });

      if (result.alreadyRefunded) {
        console.log(`[refund-reconcile] Order ${order.id}: already refunded — idempotent skip`);
        summary.alreadyRefunded++;
      } else {
        console.log(`[refund-reconcile] Order ${order.id}: synced to refunded (refundRequestId=${result.refundRequestId})`);
        summary.synced++;
      }
    } catch (err) {
      console.error(`[refund-reconcile] Order ${order.id}: processRefundCallbackDb failed:`, err?.message ?? err);
      summary.errors.push({ orderId: order.id, error: err?.message ?? String(err) });
    }
    continue;
  }

  // Not yet refunded on ECPay — increment retry_count on refund_requests
  if (refundReq?.id) {
    const newRetryCount = (refundReq.retry_count ?? 0) + 1;
    const lastError = `TradeStatus=${tradeResult.tradeStatus ?? 'unknown'} at ${new Date().toISOString()}`;

    const { error: updateErr } = await supabase
      .from('refund_requests')
      .update({ retry_count: newRetryCount, last_error: lastError })
      .eq('id', refundReq.id);

    if (updateErr) {
      console.warn(`[refund-reconcile] Order ${order.id}: failed to update retry_count:`, updateErr.message);
    } else {
      console.log(`[refund-reconcile] Order ${order.id}: retry_count=${newRetryCount}, TradeStatus=${tradeResult.tradeStatus}`);
      summary.retried++;
    }

    // Alert if retry_count exceeds threshold
    if (newRetryCount >= REFUND_RETRY_ALERT_THRESHOLD) {
      const alertMsg = `*[Refund Reconcile Alert]*\nOrder \`${order.id}\` has retried ${newRetryCount} times.\nTradeStatus: \`${tradeResult.tradeStatus}\`\nMerchantTradeNo: \`${payment.merchant_trade_no}\``;
      console.warn(`[refund-reconcile] ALERT: Order ${order.id} exceeded retry threshold (${newRetryCount} >= ${REFUND_RETRY_ALERT_THRESHOLD})`);
      await sendTelegram(alertMsg);
      summary.alerted++;
    }
  } else {
    console.warn(`[refund-reconcile] Order ${order.id}: no refund_request row found — cannot increment retry_count`);
    summary.errors.push({ orderId: order.id, error: 'no refund_request row' });
  }
}

console.log('[refund-reconcile] Summary:', JSON.stringify(summary, null, 2));
process.exit(0);
