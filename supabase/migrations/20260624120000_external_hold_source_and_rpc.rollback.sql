-- =============================================================
-- Rollback for 20260624120000_external_hold_source_and_rpc.sql
--
-- 前置：執行前須確認沒有殘留的外部佔位，否則回收約束會失敗或留下無法釋放的列。
--   SELECT count(*) FROM bookings WHERE source_channel = 'external' OR status = 'external_hold';
-- 若 >0，先以 fn_release_external_hold 釋放所有外部佔位（退還 booked_count）後再執行本檔。
-- =============================================================

BEGIN;

DROP FUNCTION IF EXISTS fn_release_external_hold(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS fn_create_external_hold(uuid, integer, uuid, uuid, text, uuid);

DROP INDEX IF EXISTS idx_bookings_schedule_id;
ALTER TABLE bookings DROP COLUMN IF EXISTS schedule_id;

-- 還原 status 約束（移除 external_hold）
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'draft', 'pending_confirmation', 'confirmed', 'completed',
    'cancelled', 'no_show', 'reschedule_requested'
  ));

-- 還原 source_channel 約束（移除 external）
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_source_channel_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_source_channel_check
  CHECK (source_channel IN ('web', 'line', 'admin_pos'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_channel_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_source_channel_check
  CHECK (source_channel IN ('web', 'line', 'admin_pos'));

COMMIT;
