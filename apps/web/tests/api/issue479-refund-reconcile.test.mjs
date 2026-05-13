/**
 * Static contract tests for issue #479 — refund reconciliation cron job.
 * Uses readFileSync + assert.match to verify structural correctness without running the script.
 */
import { readFileSync } from 'fs';
import assert from 'assert';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..', '..');

const cronScript = readFileSync(path.join(root, 'scripts/cron/refund-reconcile.mjs'), 'utf8');
const ecpayQuery = readFileSync(path.join(root, 'apps/web/src/lib/ecpay-query.mjs'), 'utf8');
const workflow = readFileSync(path.join(root, '.github/workflows/refund-reconcile.yml'), 'utf8');

// ---------------------------------------------------------------------------
// refund-reconcile.mjs contract checks
// ---------------------------------------------------------------------------

import { test } from 'node:test';

test('cron script has shebang line', () => {
  assert.match(cronScript, /^#!\/usr\/bin\/env node/);
});

test('cron script imports processRefundCallbackDb', () => {
  assert.match(cronScript, /processRefundCallbackDb/);
});

test('cron script queries for status=refund_pending', () => {
  assert.match(cronScript, /refund_pending/);
});

test("cron script checks TradeStatus === '2'", () => {
  assert.match(cronScript, /tradeStatus.*===.*'2'|TradeStatus.*===.*'2'/);
});

test('cron script increments retry_count on failure', () => {
  assert.match(cronScript, /retry_count/);
  assert.match(cronScript, /newRetryCount|retry_count.*\+.*1|\+\s*1/);
});

test('cron script has Telegram alert logic', () => {
  assert.match(cronScript, /sendTelegram|TELEGRAM_BOT_TOKEN/);
  assert.match(cronScript, /REFUND_RETRY_ALERT_THRESHOLD/);
});

test('cron script exits 0 on completion', () => {
  assert.match(cronScript, /process\.exit\(0\)/);
});

test('cron script prints summary JSON', () => {
  assert.match(cronScript, /JSON\.stringify\(summary/);
});

// ---------------------------------------------------------------------------
// ecpay-query.mjs contract checks
// ---------------------------------------------------------------------------

test('ecpay-query.mjs exports queryTradeInfo', () => {
  assert.match(ecpayQuery, /export async function queryTradeInfo/);
});

test('ecpay-query.mjs builds CheckMacValue', () => {
  assert.match(ecpayQuery, /generateCheckMacValue|CheckMacValue/);
});

test('ecpay-query.mjs returns tradeStatus field', () => {
  assert.match(ecpayQuery, /tradeStatus/);
});

test('ecpay-query.mjs supports sandbox and prod URLs', () => {
  assert.match(ecpayQuery, /payment-stage\.ecpay\.com\.tw/);
  assert.match(ecpayQuery, /payment\.ecpay\.com\.tw\/Cashier\/QueryTradeInfo/);
});

// ---------------------------------------------------------------------------
// Workflow contract checks
// ---------------------------------------------------------------------------

test('workflow has */15 cron schedule', () => {
  assert.match(workflow, /\*\/15 \* \* \* \*/);
});

test('workflow has workflow_dispatch trigger', () => {
  assert.match(workflow, /workflow_dispatch/);
});

test('workflow sets SUPABASE_URL from secrets', () => {
  assert.match(workflow, /SUPABASE_URL.*secrets\.SUPABASE_URL/);
});

test('workflow sets ECPAY_MERCHANT_ID from secrets', () => {
  assert.match(workflow, /ECPAY_MERCHANT_ID.*secrets\.ECPAY_MERCHANT_ID/);
});

test('workflow sets ECPAY_HASH_KEY from secrets', () => {
  assert.match(workflow, /ECPAY_HASH_KEY.*secrets\.ECPAY_HASH_KEY/);
});

test('workflow sets ECPAY_HASH_IV from secrets', () => {
  assert.match(workflow, /ECPAY_HASH_IV.*secrets\.ECPAY_HASH_IV/);
});

test('workflow sets TELEGRAM_BOT_TOKEN from secrets', () => {
  assert.match(workflow, /TELEGRAM_BOT_TOKEN.*secrets\.TELEGRAM_BOT_TOKEN/);
});

test('workflow sets TELEGRAM_CHAT_ID from secrets', () => {
  assert.match(workflow, /TELEGRAM_CHAT_ID.*secrets\.TELEGRAM_CHAT_ID/);
});

test('workflow runs refund-reconcile.mjs', () => {
  assert.match(workflow, /node scripts\/cron\/refund-reconcile\.mjs/);
});
