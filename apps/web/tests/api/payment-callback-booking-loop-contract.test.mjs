import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = path.resolve(__dirname, '../../../../supabase/migrations/20260423194000_issue195_callback_booking_status_loop.sql');

test('payment callback DB contract: closes booking status loop with idempotent log', async () => {
  const src = await fs.readFile(SQL, 'utf8');

  // booking status loop closure
  assert.match(src, /booking status loop closure/i);
  assert.match(src, /UPDATE bookings\s+SET status = 'pending_confirmation'/i);

  // booking status log append
  assert.match(src, /INSERT INTO booking_status_logs/i);
  assert.match(src, /WHERE NOT EXISTS\s*\(/i);
  assert.match(src, /metadata->>'orderId'/i);

  // idempotent replay path remains in function
  assert.match(src, /idempotent replay path/i);
  assert.match(src, /IF v_order\.status IN \('paid', 'confirmed', 'completed'\)/i);
});
