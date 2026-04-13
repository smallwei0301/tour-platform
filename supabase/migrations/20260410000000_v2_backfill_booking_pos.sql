-- =============================================================
-- TP-BP-002: Backfill Script for Booking/POS V2
-- Purpose: Migrate existing data to the new V2 structure
-- Date: 2026-04-10
--
-- This migration backfills:
--   1. activity_plans - Default plan per activity
--   2. bookings - From orders + activity_schedules
--   3. order_items - From orders
--   4. payment_events - From payments
--   5. orders.booking_id - Link back to created bookings
--
-- Best practices applied:
--   - Idempotent (can run multiple times safely)
--   - Uses NOT EXISTS to avoid duplicates
--   - Includes dry-run report before actual migration
--   - All operations wrapped in transaction
--
-- Prerequisite: 20260409000000_v2_booking_pos_foundation.sql
-- =============================================================

BEGIN;

-- =============================================================
-- DRY-RUN REPORT (Raises notices about what will be backfilled)
-- =============================================================

DO $$
DECLARE
  cnt_activities_no_plan integer;
  cnt_orders_no_booking integer;
  cnt_orders_no_items integer;
  cnt_payments_no_events integer;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'TP-BP-002: V2 Backfill Dry-Run Report';
  RAISE NOTICE '============================================================';

  -- Count activities without plans
  SELECT COUNT(*) INTO cnt_activities_no_plan
  FROM activities a
  WHERE NOT EXISTS (
    SELECT 1 FROM activity_plans ap WHERE ap.activity_id = a.id
  );
  RAISE NOTICE '[B1] Activities without plans: %', cnt_activities_no_plan;

  -- Count orders without bookings (that have a schedule)
  SELECT COUNT(*) INTO cnt_orders_no_booking
  FROM orders o
  WHERE o.schedule_id IS NOT NULL
    AND o.booking_id IS NULL;
  RAISE NOTICE '[B2] Orders with schedule but no booking: %', cnt_orders_no_booking;

  -- Count orders without order_items
  SELECT COUNT(*) INTO cnt_orders_no_items
  FROM orders o
  WHERE NOT EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
  );
  RAISE NOTICE '[B3] Orders without order_items: %', cnt_orders_no_items;

  -- Count payments without payment_events
  SELECT COUNT(*) INTO cnt_payments_no_events
  FROM payments p
  WHERE NOT EXISTS (
    SELECT 1 FROM payment_events pe WHERE pe.payment_id = p.id
  );
  RAISE NOTICE '[B4] Payments without payment_events: %', cnt_payments_no_events;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Starting backfill...';
  RAISE NOTICE '============================================================';
END $$;

-- =============================================================
-- B1: Backfill activity_plans
-- Strategy: Create a 'default' plan for each activity without one
-- =============================================================

INSERT INTO activity_plans (
  activity_id,
  name,
  slug,
  duration_minutes,
  price_type,
  base_price,
  min_participants,
  max_participants,
  booking_type,
  status,
  created_at,
  updated_at
)
SELECT
  a.id,
  'Default Plan',
  'default',
  COALESCE(a.duration_minutes, 240),  -- Default 4 hours if not set
  'per_person',
  COALESCE(a.price_twd, 0),
  COALESCE(a.min_participants, 1),
  COALESCE(a.max_participants, 10),
  'instant',
  CASE
    WHEN a.status = 'published' THEN 'active'
    ELSE 'inactive'
  END,
  a.created_at,
  now()
FROM activities a
WHERE NOT EXISTS (
  SELECT 1 FROM activity_plans ap WHERE ap.activity_id = a.id
);

-- =============================================================
-- B2: Backfill bookings from orders + activity_schedules
-- Strategy:
--   - For orders with schedule_id, create a booking
--   - Map order status to booking status
--   - Link booking to order
--
-- Status Mapping (orders -> bookings):
--   pending_payment     -> draft
--   paid                -> pending_confirmation
--   confirmed           -> confirmed
--   completed           -> completed
--   cancelled_by_user   -> cancelled
--   cancelled_by_guide  -> cancelled
--   refund_pending      -> cancelled
--   refunded            -> cancelled
-- =============================================================

-- Create temp table to track created bookings for linking
CREATE TEMP TABLE IF NOT EXISTS _backfill_booking_map (
  order_id uuid PRIMARY KEY,
  booking_id uuid NOT NULL
);

-- Insert bookings and capture the mapping
WITH booking_inserts AS (
  INSERT INTO bookings (
    booking_no,
    traveler_id,
    guide_id,
    activity_id,
    activity_plan_id,
    source_channel,
    start_at,
    end_at,
    timezone,
    participants,
    status,
    order_id,
    customer_note,
    internal_note,
    confirmed_at,
    completed_at,
    cancelled_at,
    created_at,
    updated_at
  )
  SELECT
    -- Generate booking_no: BK-YYYYMMDD-XXXXX based on order created_at
    'BK-' || to_char(o.created_at, 'YYYYMMDD') || '-' ||
      lpad((ROW_NUMBER() OVER (PARTITION BY date_trunc('day', o.created_at) ORDER BY o.created_at))::text, 5, '0'),
    NULL,  -- traveler_id: we don't have user-linked orders in MVP
    a.guide_id,
    o.activity_id,
    (SELECT ap.id FROM activity_plans ap WHERE ap.activity_id = o.activity_id AND ap.slug = 'default' LIMIT 1),
    'web',
    s.start_at,
    s.end_at,
    'Asia/Taipei',
    COALESCE(o.people_count, 1),
    -- Status mapping
    CASE o.status
      WHEN 'pending_payment' THEN 'draft'
      WHEN 'paid' THEN 'pending_confirmation'
      WHEN 'confirmed' THEN 'confirmed'
      WHEN 'completed' THEN 'completed'
      WHEN 'cancelled_by_user' THEN 'cancelled'
      WHEN 'cancelled_by_guide' THEN 'cancelled'
      WHEN 'refund_pending' THEN 'cancelled'
      WHEN 'refunded' THEN 'cancelled'
      ELSE 'draft'
    END,
    o.id,
    NULL,  -- customer_note
    o.admin_note,
    -- confirmed_at: set if status is confirmed or completed
    CASE WHEN o.status IN ('confirmed', 'completed') THEN COALESCE(o.paid_at, o.updated_at) END,
    -- completed_at: set if status is completed
    CASE WHEN o.status = 'completed' THEN o.updated_at END,
    -- cancelled_at: set if status is cancelled
    CASE WHEN o.status IN ('cancelled_by_user', 'cancelled_by_guide', 'refund_pending', 'refunded') THEN o.updated_at END,
    o.created_at,
    now()
  FROM orders o
  INNER JOIN activity_schedules s ON s.id = o.schedule_id
  INNER JOIN activities a ON a.id = o.activity_id
  WHERE o.schedule_id IS NOT NULL
    AND o.booking_id IS NULL
    AND a.guide_id IS NOT NULL
  RETURNING id AS booking_id, order_id
)
INSERT INTO _backfill_booking_map (order_id, booking_id)
SELECT order_id, booking_id FROM booking_inserts;

-- Update orders with the booking_id reference
UPDATE orders o
SET
  booking_id = m.booking_id,
  source_channel = 'web',
  payment_status = CASE o.status
    WHEN 'pending_payment' THEN 'pending'
    WHEN 'paid' THEN 'paid'
    WHEN 'confirmed' THEN 'paid'
    WHEN 'completed' THEN 'paid'
    WHEN 'refund_pending' THEN 'partially_refunded'
    WHEN 'refunded' THEN 'refunded'
    ELSE 'pending'
  END
FROM _backfill_booking_map m
WHERE o.id = m.order_id;

-- Insert initial booking_status_logs for backfilled bookings
INSERT INTO booking_status_logs (
  booking_id,
  from_status,
  to_status,
  actor_role,
  reason,
  metadata,
  created_at
)
SELECT
  b.id,
  NULL,
  b.status,
  'system',
  'Backfilled from V1 order',
  jsonb_build_object(
    'source', 'v2_backfill',
    'original_order_status', o.status,
    'migration_date', now()::text
  ),
  b.created_at
FROM bookings b
INNER JOIN orders o ON o.id = b.order_id
WHERE NOT EXISTS (
  SELECT 1 FROM booking_status_logs bsl WHERE bsl.booking_id = b.id
);

-- Clean up temp table
DROP TABLE IF EXISTS _backfill_booking_map;

-- =============================================================
-- B3: Backfill order_items from orders
-- Strategy: Create one 'activity_booking' item per order
-- =============================================================

INSERT INTO order_items (
  order_id,
  item_type,
  ref_id,
  title,
  quantity,
  unit_price,
  subtotal_amount,
  metadata,
  created_at
)
SELECT
  o.id,
  'activity_booking',
  o.booking_id,  -- Reference to the booking
  COALESCE(a.title, 'Tour Activity'),
  COALESCE(o.people_count, 1),
  CASE
    WHEN o.people_count > 0 THEN o.total_twd / o.people_count
    ELSE o.total_twd
  END,
  o.total_twd,
  jsonb_build_object(
    'activity_id', o.activity_id,
    'schedule_id', o.schedule_id,
    'contact_name', o.contact_name,
    'contact_email', o.contact_email
  ),
  o.created_at
FROM orders o
LEFT JOIN activities a ON a.id = o.activity_id
WHERE NOT EXISTS (
  SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
);

-- =============================================================
-- B4: Backfill payment_events from payments
-- Strategy: Create 'initiated' event for all, 'paid' event if paid
-- =============================================================

-- Create 'initiated' event for all payments
INSERT INTO payment_events (
  payment_id,
  event_type,
  payload,
  created_at
)
SELECT
  p.id,
  'initiated',
  jsonb_build_object(
    'amount', p.amount_twd,
    'provider', p.provider,
    'trade_no', p.trade_no,
    'source', 'v2_backfill'
  ),
  p.created_at
FROM payments p
WHERE NOT EXISTS (
  SELECT 1 FROM payment_events pe
  WHERE pe.payment_id = p.id AND pe.event_type = 'initiated'
);

-- Create 'paid' event for paid payments
INSERT INTO payment_events (
  payment_id,
  event_type,
  payload,
  created_at
)
SELECT
  p.id,
  'paid',
  jsonb_build_object(
    'amount', p.amount_twd,
    'provider', p.provider,
    'trade_no', p.trade_no,
    'paid_at', p.paid_at,
    'raw_payload_present', p.raw_payload IS NOT NULL,
    'source', 'v2_backfill'
  ),
  COALESCE(p.paid_at, p.updated_at)
FROM payments p
WHERE p.status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM payment_events pe
    WHERE pe.payment_id = p.id AND pe.event_type = 'paid'
  );

-- Create 'failed' event for failed payments
INSERT INTO payment_events (
  payment_id,
  event_type,
  payload,
  created_at
)
SELECT
  p.id,
  'failed',
  jsonb_build_object(
    'provider', p.provider,
    'trade_no', p.trade_no,
    'source', 'v2_backfill'
  ),
  p.updated_at
FROM payments p
WHERE p.status = 'failed'
  AND NOT EXISTS (
    SELECT 1 FROM payment_events pe
    WHERE pe.payment_id = p.id AND pe.event_type = 'failed'
  );

-- =============================================================
-- POST-BACKFILL VERIFICATION REPORT
-- =============================================================

DO $$
DECLARE
  cnt_plans integer;
  cnt_bookings integer;
  cnt_order_items integer;
  cnt_payment_events integer;
  cnt_booking_logs integer;
  cnt_orders_with_booking integer;
  cnt_orders_missing_booking integer;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'TP-BP-002: V2 Backfill Verification Report';
  RAISE NOTICE '============================================================';

  SELECT COUNT(*) INTO cnt_plans FROM activity_plans;
  SELECT COUNT(*) INTO cnt_bookings FROM bookings;
  SELECT COUNT(*) INTO cnt_order_items FROM order_items;
  SELECT COUNT(*) INTO cnt_payment_events FROM payment_events;
  SELECT COUNT(*) INTO cnt_booking_logs FROM booking_status_logs;

  SELECT COUNT(*) INTO cnt_orders_with_booking
  FROM orders WHERE booking_id IS NOT NULL;

  SELECT COUNT(*) INTO cnt_orders_missing_booking
  FROM orders o
  WHERE o.schedule_id IS NOT NULL
    AND o.booking_id IS NULL;

  RAISE NOTICE '[Table Counts]';
  RAISE NOTICE '  activity_plans: %', cnt_plans;
  RAISE NOTICE '  bookings: %', cnt_bookings;
  RAISE NOTICE '  order_items: %', cnt_order_items;
  RAISE NOTICE '  payment_events: %', cnt_payment_events;
  RAISE NOTICE '  booking_status_logs: %', cnt_booking_logs;

  RAISE NOTICE '[Linkage Verification]';
  RAISE NOTICE '  orders with booking_id: %', cnt_orders_with_booking;
  RAISE NOTICE '  orders missing booking (with schedule): %', cnt_orders_missing_booking;

  -- Data integrity checks
  IF cnt_orders_missing_booking > 0 THEN
    RAISE WARNING 'Some orders with schedules could not be linked to bookings. Check for missing guide_id in activities.';
  END IF;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Backfill completed successfully!';
  RAISE NOTICE '============================================================';
END $$;

COMMIT;
