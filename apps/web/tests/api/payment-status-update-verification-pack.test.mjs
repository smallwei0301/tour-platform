import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SQL = path.resolve(
  process.cwd(),
  '../../supabase/migrations/20260424124000_issue197_sync_orders_payment_status_callback.sql'
);

test('payment-status-update verification pack: success path sets orders.payment_status=paid', async () => {
  const src = await fs.readFile(SQL, 'utf8');

  assert.match(src, /UPDATE orders\s+SET status = 'paid',\s*payment_status = 'paid'/is);
  assert.match(src, /WHERE id = v_order\.id\s+AND status = 'pending_payment'/is);
  assert.match(src, /UPDATE payments pay\s+SET status = 'paid'/is);
});

test('payment-status-update verification pack: mismatch replay heals pending->paid', async () => {
  const src = await fs.readFile(SQL, 'utf8');

  assert.match(src, /idempotent replay path/i);
  assert.match(src, /UPDATE orders\s+SET payment_status = 'paid'/is);
  assert.match(src, /coalesce\(payment_status, 'pending'\) <> 'paid'/i);
  assert.match(src, /#197: heal historical mismatch/i);
});
