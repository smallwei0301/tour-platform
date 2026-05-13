#!/usr/bin/env node
/**
 * Admin: one-shot historical backfill for refund_pending orders.
 * Issue #480 — historical refund backfill script
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ECPAY_MERCHANT_ID, ECPAY_HASH_KEY, ECPAY_HASH_IV
 *
 * Optional env:
 *   ECPAY_ENV=production  (default: sandbox)
 *
 * CLI flags:
 *   --dry-run            Query ECPay and report; no DB writes (default)
 *   --write              Apply transitions to DB
 *   --yes                Skip "YES" confirmation prompt when using --write
 *   --order-id=<uuid>    Restrict to a single order
 *   --out=<path>         Write JSON summary report to file
 *   --log=<path>         Write per-order diff log to file
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { queryTradeInfo } from '../../apps/web/src/lib/ecpay-query.mjs';
import { processRefundCallbackDb } from '../../apps/web/src/lib/db.mjs';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

const hasFlag = (flag) => args.includes(flag);
const getFlagValue = (prefix) => {
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};

const isDryRun = !hasFlag('--write');
const skipConfirm = hasFlag('--yes');
const orderId = getFlagValue('--order-id=');
const outPath = getFlagValue('--out=');
const logPath = getFlagValue('--log=');

const mode = isDryRun ? 'dry-run' : 'write';

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------
const REQUIRED_ENVS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ECPAY_MERCHANT_ID', 'ECPAY_HASH_KEY', 'ECPAY_HASH_IV'];
const missing = REQUIRED_ENVS.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error('[backfill-refund-status] Missing required env vars:', missing.join(', '));
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ECPAY_MERCHANT_ID = process.env.ECPAY_MERCHANT_ID;
const ECPAY_HASH_KEY = process.env.ECPAY_HASH_KEY;
const ECPAY_HASH_IV = process.env.ECPAY_HASH_IV;
const IS_SANDBOX = (process.env.ECPAY_ENV ?? 'sandbox') !== 'production';

// ---------------------------------------------------------------------------
// Confirmation prompt helper
// ---------------------------------------------------------------------------
async function confirmWrite() {
  if (skipConfirm) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('[backfill-refund-status] Type YES to apply DB writes: ', (answer) => {
      rl.close();
      resolve(answer.trim() === 'YES');
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const startMs = Date.now();
console.log(`[backfill-refund-status] Starting in ${mode} mode${orderId ? ` (order-id=${orderId})` : ''}`);

if (!isDryRun) {
  const confirmed = await confirmWrite();
  if (!confirmed) {
    console.log('[backfill-refund-status] Aborted — confirmation not received.');
    process.exit(0);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Build query — no stale filter; this is a historical sweep of ALL refund_pending
let query = supabase
  .from('orders')
  .select(`
    id,
    status,
    updated_at,
    payments ( merchant_trade_no, trade_no, status )
  `)
  .eq('status', 'refund_pending')
  .order('updated_at', { ascending: true });

if (orderId) {
  query = query.eq('id', orderId);
}

const { data: pendingOrders, error: queryErr } = await query;

if (queryErr) {
  console.error('[backfill-refund-status] Failed to query orders:', queryErr.message);
  process.exit(1);
}

const orders = pendingOrders ?? [];
console.log(`[backfill-refund-status] Found ${orders.length} refund_pending order(s)`);

const summary = {
  mode,
  total: orders.length,
  updated: 0,
  alreadyRefunded: 0,
  skipped: 0,
  errors: [],
  generatedAt: new Date().toISOString(),
  durationMs: 0,
};

const diffs = [];

for (const order of orders) {
  const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;

  if (!payment?.merchant_trade_no) {
    console.warn(`[backfill-refund-status] Order ${order.id}: no merchant_trade_no — skipping`);
    summary.errors.push({ orderId: order.id, error: 'no merchant_trade_no' });
    continue;
  }

  const merchantTradeNo = payment.merchant_trade_no;

  // Capture before snapshot
  const before = { orderId: order.id, status: order.status, merchantTradeNo };

  let tradeResult;
  try {
    tradeResult = await queryTradeInfo({
      merchantTradeNo,
      merchantId: ECPAY_MERCHANT_ID,
      hashKey: ECPAY_HASH_KEY,
      hashIV: ECPAY_HASH_IV,
      isSandbox: IS_SANDBOX,
    });
  } catch (err) {
    console.error(`[backfill-refund-status] Order ${order.id}: queryTradeInfo threw:`, err?.message ?? err);
    summary.errors.push({ orderId: order.id, error: err?.message ?? String(err) });
    continue;
  }

  // ECPay TradeStatus === '2' means refund completed on ECPay's side
  if (tradeResult.tradeStatus === '2') {
    if (isDryRun) {
      console.log(`[backfill-refund-status] Order ${order.id}: would_update (TradeStatus=2, dry-run)`);
      diffs.push({ ...before, action: 'would_update', tradeStatus: tradeResult.tradeStatus });
      summary.updated++;
    } else {
      try {
        const result = await processRefundCallbackDb(supabase, {
          merchantTradeNo,
          tradeNo: tradeResult.tradeNo || payment.trade_no || '',
          rawPayload: { ...tradeResult.raw, source: 'backfill' },
        });

        if (result.alreadyRefunded) {
          console.log(`[backfill-refund-status] Order ${order.id}: already refunded — idempotent skip`);
          diffs.push({ ...before, action: 'already_refunded' });
          summary.alreadyRefunded++;
        } else {
          console.log(`[backfill-refund-status] Order ${order.id}: updated to refunded (refundRequestId=${result.refundRequestId})`);
          diffs.push({ ...before, action: 'updated', refundRequestId: result.refundRequestId });
          summary.updated++;
        }
      } catch (err) {
        console.error(`[backfill-refund-status] Order ${order.id}: processRefundCallbackDb failed:`, err?.message ?? err);
        summary.errors.push({ orderId: order.id, error: err?.message ?? String(err) });
      }
    }
  } else {
    const reason = `TradeStatus=${tradeResult.tradeStatus ?? 'unknown'} (not 2)`;
    console.log(`[backfill-refund-status] Order ${order.id}: skipped — ${reason}`);
    diffs.push({ ...before, action: 'skipped', reason });
    summary.skipped++;
  }
}

summary.durationMs = Date.now() - startMs;

console.log('[backfill-refund-status] Summary:', JSON.stringify(summary, null, 2));

if (outPath) {
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`[backfill-refund-status] Report written to ${outPath}`);
}

if (logPath) {
  writeFileSync(logPath, JSON.stringify(diffs, null, 2));
  console.log(`[backfill-refund-status] Diff log written to ${logPath}`);
}

process.exit(0);
