-- =============================================================
-- TP-BP-002: Dry-Run Report for V2 Backfill
-- Purpose: Show what data will be migrated WITHOUT making changes
-- Date: 2026-04-10
--
-- Run this script BEFORE the actual migration to verify:
--   1. What data will be migrated
--   2. Any potential issues or data anomalies
--   3. Expected row counts for each backfill
--
-- Usage: psql -d $DATABASE_URL -f v2_backfill_dry_run.sql
-- =============================================================

\echo '============================================================'
\echo 'TP-BP-002: V2 Backfill Dry-Run Report'
\echo 'Date:' `date`
\echo '============================================================'
\echo ''

-- =============================================================
-- Current State Summary
-- =============================================================
\echo '>> Current Table Counts:'

SELECT 'activities' AS table_name, COUNT(*) AS row_count FROM activities
UNION ALL
SELECT 'activity_plans', COUNT(*) FROM activity_plans
UNION ALL
SELECT 'activity_schedules', COUNT(*) FROM activity_schedules
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL
SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL
SELECT 'booking_status_logs', COUNT(*) FROM booking_status_logs
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'payment_events', COUNT(*) FROM payment_events
ORDER BY table_name;

\echo ''
\echo '============================================================'
\echo '[B1] Activity Plans Backfill Preview'
\echo '============================================================'

\echo '>> Activities without plans (will create default plan):'
SELECT
  a.id,
  a.title,
  a.status,
  a.price_twd,
  a.duration_minutes,
  a.min_participants,
  a.max_participants
FROM activities a
WHERE NOT EXISTS (
  SELECT 1 FROM activity_plans ap WHERE ap.activity_id = a.id
)
ORDER BY a.created_at DESC
LIMIT 20;

SELECT COUNT(*) AS "Total activities needing default plan"
FROM activities a
WHERE NOT EXISTS (
  SELECT 1 FROM activity_plans ap WHERE ap.activity_id = a.id
);

\echo ''
\echo '============================================================'
\echo '[B2] Bookings Backfill Preview'
\echo '============================================================'

\echo '>> Orders with schedule but no booking (will create booking):'
SELECT
  o.id AS order_id,
  o.status AS order_status,
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
  END AS mapped_booking_status,
  o.people_count,
  o.total_twd,
  s.start_at,
  s.end_at,
  a.guide_id IS NOT NULL AS has_guide
FROM orders o
INNER JOIN activity_schedules s ON s.id = o.schedule_id
LEFT JOIN activities a ON a.id = o.activity_id
WHERE o.schedule_id IS NOT NULL
  AND o.booking_id IS NULL
ORDER BY o.created_at DESC
LIMIT 20;

SELECT
  COUNT(*) AS "Total orders to convert to bookings",
  SUM(CASE WHEN a.guide_id IS NOT NULL THEN 1 ELSE 0 END) AS "With guide (will succeed)",
  SUM(CASE WHEN a.guide_id IS NULL THEN 1 ELSE 0 END) AS "Without guide (will skip)"
FROM orders o
INNER JOIN activity_schedules s ON s.id = o.schedule_id
LEFT JOIN activities a ON a.id = o.activity_id
WHERE o.schedule_id IS NOT NULL
  AND o.booking_id IS NULL;

\echo ''
\echo '>> Order status distribution (for mapping verification):'
SELECT
  o.status,
  COUNT(*) AS count,
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
  END AS maps_to
FROM orders o
WHERE o.schedule_id IS NOT NULL
  AND o.booking_id IS NULL
GROUP BY o.status
ORDER BY count DESC;

\echo ''
\echo '============================================================'
\echo '[B3] Order Items Backfill Preview'
\echo '============================================================'

\echo '>> Orders without order_items (will create activity_booking item):'
SELECT
  o.id AS order_id,
  o.status,
  o.people_count AS quantity,
  o.total_twd,
  CASE WHEN o.people_count > 0 THEN o.total_twd / o.people_count ELSE o.total_twd END AS unit_price,
  COALESCE(a.title, 'Unknown Activity') AS title
FROM orders o
LEFT JOIN activities a ON a.id = o.activity_id
WHERE NOT EXISTS (
  SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
)
ORDER BY o.created_at DESC
LIMIT 20;

SELECT COUNT(*) AS "Total orders needing order_items"
FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
);

\echo ''
\echo '============================================================'
\echo '[B4] Payment Events Backfill Preview'
\echo '============================================================'

\echo '>> Payments without events (will create initiated + status event):'
SELECT
  p.id AS payment_id,
  p.status,
  p.provider,
  p.amount_twd,
  p.trade_no,
  p.paid_at,
  CASE
    WHEN p.status = 'paid' THEN 'initiated + paid'
    WHEN p.status = 'failed' THEN 'initiated + failed'
    ELSE 'initiated'
  END AS events_to_create
FROM payments p
WHERE NOT EXISTS (
  SELECT 1 FROM payment_events pe WHERE pe.payment_id = p.id
)
ORDER BY p.created_at DESC
LIMIT 20;

SELECT
  p.status,
  COUNT(*) AS count
FROM payments p
WHERE NOT EXISTS (
  SELECT 1 FROM payment_events pe WHERE pe.payment_id = p.id
)
GROUP BY p.status
ORDER BY count DESC;

\echo ''
\echo '============================================================'
\echo 'Data Integrity Warnings'
\echo '============================================================'

\echo '>> Orders with schedule but activity has no guide (cannot create booking):'
SELECT
  o.id AS order_id,
  o.activity_id,
  a.title AS activity_title,
  a.guide_id
FROM orders o
INNER JOIN activities a ON a.id = o.activity_id
WHERE o.schedule_id IS NOT NULL
  AND o.booking_id IS NULL
  AND a.guide_id IS NULL;

\echo ''
\echo '>> Payments with NULL order_id (orphaned):'
SELECT
  p.id,
  p.status,
  p.amount_twd
FROM payments p
WHERE p.order_id IS NULL;

\echo ''
\echo '============================================================'
\echo 'Summary'
\echo '============================================================'

DO $$
DECLARE
  cnt_activities_no_plan integer;
  cnt_orders_no_booking integer;
  cnt_orders_no_booking_no_guide integer;
  cnt_orders_no_items integer;
  cnt_payments_no_events integer;
BEGIN
  SELECT COUNT(*) INTO cnt_activities_no_plan
  FROM activities a
  WHERE NOT EXISTS (SELECT 1 FROM activity_plans ap WHERE ap.activity_id = a.id);

  SELECT COUNT(*) INTO cnt_orders_no_booking
  FROM orders o
  INNER JOIN activities a ON a.id = o.activity_id
  WHERE o.schedule_id IS NOT NULL
    AND o.booking_id IS NULL
    AND a.guide_id IS NOT NULL;

  SELECT COUNT(*) INTO cnt_orders_no_booking_no_guide
  FROM orders o
  INNER JOIN activities a ON a.id = o.activity_id
  WHERE o.schedule_id IS NOT NULL
    AND o.booking_id IS NULL
    AND a.guide_id IS NULL;

  SELECT COUNT(*) INTO cnt_orders_no_items
  FROM orders o
  WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id);

  SELECT COUNT(*) INTO cnt_payments_no_events
  FROM payments p
  WHERE NOT EXISTS (SELECT 1 FROM payment_events pe WHERE pe.payment_id = p.id);

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'BACKFILL SUMMARY';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '[B1] Activity plans to create: %', cnt_activities_no_plan;
  RAISE NOTICE '[B2] Bookings to create: %', cnt_orders_no_booking;
  RAISE NOTICE '     (% orders skipped - activity has no guide)', cnt_orders_no_booking_no_guide;
  RAISE NOTICE '[B3] Order items to create: %', cnt_orders_no_items;
  RAISE NOTICE '[B4] Payment events to create: ~% (initiated + status events)', cnt_payments_no_events;
  RAISE NOTICE '============================================================';

  IF cnt_orders_no_booking_no_guide > 0 THEN
    RAISE WARNING 'WARNING: % orders cannot be converted to bookings because their activities have no guide_id', cnt_orders_no_booking_no_guide;
  END IF;
END $$;

\echo ''
\echo 'Dry-run complete. No changes were made.'
\echo 'To execute the backfill, run: 20260410000000_v2_backfill_booking_pos.sql'
