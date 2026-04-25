import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL(
  '../../supabase/migrations/20260425093000_issue_216_order_items_booking_fk_batch1.sql',
  import.meta.url
);

test('issue #216 migration enforces bounded activity_booking FK slice', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ADD COLUMN IF NOT EXISTS booking_id uuid/i);
  assert.match(sql, /WHERE oi\.item_type = 'activity_booking'[\s\S]*oi\.booking_id IS NULL[\s\S]*oi\.ref_id IS NOT NULL/i);
  assert.match(sql, /fk_order_items_booking_id[\s\S]*FOREIGN KEY \(booking_id\)[\s\S]*REFERENCES public\.bookings\(id\)/i);
  assert.match(sql, /ck_order_items_booking_required_for_activity_booking[\s\S]*item_type <> 'activity_booking' OR booking_id IS NOT NULL/i);

  // Keep non-booking item types FK-free by design (nullable + conditional check only)
  assert.doesNotMatch(sql, /ALTER TABLE public\.order_items[\s\S]*ALTER COLUMN booking_id SET NOT NULL/i);
});
