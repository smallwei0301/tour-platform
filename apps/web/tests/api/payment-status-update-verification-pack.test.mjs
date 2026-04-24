import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SQL = path.resolve(
  process.cwd(),
  '../../supabase/migrations/20260424203000_issue197_sync_orders_payment_status_callback.sql'
);

test('payment-status-update: success path sets orders.payment_status=paid on callback transition', async () => {
  const src = await fs.readFile(SQL, 'utf8');

  assert.match(src, /UPDATE orders\s+SET status = 'paid',\s*\n\s*payment_status = 'paid'/i);
  assert.match(src, /WHERE id = v_order\.id\s*\n\s*AND status = 'pending_payment'/i);
});

test('payment-status-update: mismatch replay heals paid\/pending split to paid\/paid', async () => {
  const src = await fs.readFile(SQL, 'utf8');

  assert.match(src, /idempotent replay path/i);
  assert.match(src, /IF v_order\.status IN \('paid', 'confirmed', 'completed'\)/i);
  assert.match(src, /UPDATE orders o\s*\n\s*SET payment_status = 'paid'/i);
  assert.match(src, /coalesce\(o\.payment_status, 'pending'\) <> 'paid'/i);
});
