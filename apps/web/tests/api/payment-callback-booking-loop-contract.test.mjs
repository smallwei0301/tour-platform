import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 三種預約模式 PR3 起，fn_process_payment_callback_atomic 的有效定義改由此
// CREATE OR REPLACE migration 提供（付款後依 booking_type 自動確認），取代
// 20260423194000 的 draft→pending_confirmation 版本。
const SQL = path.resolve(__dirname, '../../../../supabase/migrations/20260624130000_callback_booking_type_auto_confirm.sql');

test('payment callback DB contract: closes booking status loop with idempotent log', async () => {
  const src = await fs.readFile(SQL, 'utf8');

  // booking status loop closure — now booking_type-driven (confirmed / pending_confirmation)
  assert.match(src, /booking status loop closure/i);
  assert.match(src, /UPDATE bookings\s+SET status = v_target_status/i);
  assert.match(src, /IF v_booking_type IN \('instant', 'scheduled', 'request'\) THEN/i);

  // booking status log append
  assert.match(src, /INSERT INTO booking_status_logs/i);
  assert.match(src, /WHERE NOT EXISTS\s*\(/i);
  assert.match(src, /metadata->>'orderId'/i);

  // idempotent replay path remains in function
  assert.match(src, /idempotent replay path/i);
  assert.match(src, /IF v_order\.status IN \('paid', 'confirmed', 'completed'\)/i);
});
