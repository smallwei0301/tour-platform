import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SQL = path.resolve(
  process.cwd(),
  '../../supabase/migrations/20260508203000_issue178_line_liff_callback_audit_continuity.sql'
);

test('GH-178 callback audit continuity: preserves LINE/LIFF origin and correlation separately from system actor', async () => {
  const src = await fs.readFile(SQL, 'utf8');

  assert.match(src, /actor_role,\s*reason,\s*metadata/is);
  assert.match(src, /'system',\s*'Payment callback received'/is);
  assert.match(src, /v_origin_source_channel\s+text/i);
  assert.match(src, /v_correlation_id\s+text/i);
  assert.match(src, /nullif\(v_booking\.source_channel, ''\)/i);
  assert.match(src, /nullif\(v_order\.source_channel, ''\)/i);
  assert.match(src, /FROM booking_status_logs bsl[\s\S]*metadata \? 'correlationId'/i);
  assert.match(src, /JOIN payment_events pe[\s\S]*payload \? 'correlationId'/i);
  assert.match(src, /'sourceChannel', v_origin_source_channel/i);
  assert.match(src, /'originSourceChannel', v_origin_source_channel/i);
  assert.match(src, /'correlationId', v_correlation_id/i);
  assert.match(src, /line_liff_payment_callback_status_transition/i);
});

test('GH-178 callback audit continuity: keeps #197 payment status sync and idempotency guard', async () => {
  const src = await fs.readFile(SQL, 'utf8');

  assert.match(src, /#197: heal historical mismatch/i);
  assert.match(src, /UPDATE orders\s+SET status = 'paid',\s*payment_status = 'paid'/is);
  assert.match(src, /WHERE id = v_order\.id\s+AND status = 'pending_payment'/is);
  assert.match(src, /WHERE NOT EXISTS\s*\([\s\S]*metadata->>'orderId'/i);
});
