-- =============================================================
-- TP-BP-002: Rollback Script for V2 Backfill
-- Purpose: Revert backfilled data (not the schema)
-- Date: 2026-04-10
--
-- CAUTION: This removes backfilled data only.
-- It does NOT drop the V2 tables (use foundation rollback for that).
-- =============================================================

BEGIN;

-- Remove payment_events created by backfill
DELETE FROM payment_events
WHERE (payload->>'source') = 'v2_backfill';

-- Remove order_items created by backfill
DELETE FROM order_items
WHERE (metadata->>'source') IS NULL  -- backfill doesn't set source in metadata
  AND item_type = 'activity_booking';

-- Remove booking_status_logs created by backfill
DELETE FROM booking_status_logs
WHERE (metadata->>'source') = 'v2_backfill';

-- Unlink orders from bookings
UPDATE orders
SET booking_id = NULL,
    source_channel = NULL,
    payment_status = NULL
WHERE booking_id IN (
  SELECT id FROM bookings WHERE internal_note IS NULL AND order_id IS NOT NULL
);

-- Remove backfilled bookings
DELETE FROM bookings
WHERE order_id IS NOT NULL
  AND customer_note IS NULL;

-- Remove default activity_plans
DELETE FROM activity_plans
WHERE slug = 'default'
  AND name = 'Default Plan';

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'TP-BP-002: Rollback completed';
  RAISE NOTICE 'Backfilled data has been removed.';
  RAISE NOTICE '============================================================';
END $$;

COMMIT;
