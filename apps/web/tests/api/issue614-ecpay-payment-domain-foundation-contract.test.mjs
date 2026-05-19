import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  '../../../../supabase/migrations/20260519120000_issue614_ecpay_payment_domain_foundation.sql'
);

const sql = readFileSync(migrationPath, 'utf8');

test('payments adds provider lifecycle columns additively', () => {
  assert.match(sql, /ALTER TABLE\s+payments[\s\S]*ADD COLUMN IF NOT EXISTS merchant_trade_no\s+text/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS provider_status\s+text/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS authorized_at\s+timestamptz/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS refunded_amount_twd\s+integer\s+NOT NULL\s+DEFAULT 0/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS last_provider_query_payload\s+jsonb/i);
});

test('payments enforces idempotency indexes for provider keys', () => {
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_merchant_trade_no_unique[\s\S]*ON payments\(provider, merchant_trade_no\)[\s\S]*WHERE merchant_trade_no IS NOT NULL;/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_trade_no_unique[\s\S]*ON payments\(provider, trade_no\)[\s\S]*WHERE trade_no IS NOT NULL;/i);
});

test('payment_events event_type check includes callback/reconcile/reversal states', () => {
  assert.match(sql, /callback_paid/i);
  assert.match(sql, /provider_reconciled_paid/i);
  assert.match(sql, /authorization_voided/i);
  assert.match(sql, /refunded/i);
  assert.match(sql, /reversal_blocked/i);
  assert.match(sql, /reversal_incident/i);
});

test('payment_events duplicate guard index exists for idempotent provider events', () => {
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event_idempotent_unique/i);
  assert.match(sql, /WHERE event_type IN\s*\([\s\S]*'callback_paid'[\s\S]*'provider_reconciled_paid'[\s\S]*'authorization_voided'[\s\S]*'refunded'[\s\S]*\)/i);
});

test('RLS/grants hardened to service_role-only for payments and payment_events', () => {
  assert.match(sql, /CREATE POLICY\s+"payments:\s*service_role only"\s+ON\s+payments\s+FOR ALL\s+TO\s+service_role\s+USING\s*\(true\)\s+WITH CHECK\s*\(true\);/i);
  assert.match(sql, /CREATE POLICY\s+"payment_events:\s*service_role only"\s+ON\s+payment_events\s+FOR ALL\s+TO\s+service_role\s+USING\s*\(true\)\s+WITH CHECK\s*\(true\);/i);
  assert.match(sql, /REVOKE ALL ON TABLE\s+payments\s+FROM\s+anon,\s*authenticated,\s*public;/i);
  assert.match(sql, /REVOKE ALL ON TABLE\s+payment_events\s+FROM\s+anon,\s*authenticated,\s*public;/i);
});

test('callback RPC contract accepts merchant_trade_no and provider defaults', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION\s+fn_process_payment_callback_atomic\s*\([\s\S]*p_merchant_trade_no\s+text\s+DEFAULT\s+NULL,[\s\S]*p_provider\s+text\s+DEFAULT\s+'ecpay'/i);
  assert.match(sql, /merchant_trade_no\s*=\s*coalesce\(pay\.merchant_trade_no,\s*v_merchant_trade_no\)/i);
});
