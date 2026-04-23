-- DEPRECATED LEGACY NAME NOTICE
-- This file name is historical (issue #161), but verification logic is aligned with issue #164 actual production schema.
-- Do NOT validate payments.booking_id here.
-- Canonical relationships:
-- - bookings.order_id -> orders.id
-- - orders.booking_id -> bookings.id
-- - payments.order_id -> orders.id

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'order_id'
  ) AS has_bookings_order_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'booking_id'
  ) AS has_orders_booking_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'order_id'
  ) AS has_payments_order_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'booking_id'
  ) AS has_payments_booking_id_column;

SELECT
  COUNT(*) AS bookings_order_id_orphan_count
FROM public.bookings b
LEFT JOIN public.orders o ON o.id = b.order_id
WHERE b.order_id IS NOT NULL
  AND o.id IS NULL;

SELECT
  COUNT(*) AS orders_booking_id_orphan_count
FROM public.orders o
LEFT JOIN public.bookings b ON b.id = o.booking_id
WHERE o.booking_id IS NOT NULL
  AND b.id IS NULL;

SELECT
  COUNT(*) AS payments_order_id_orphan_count
FROM public.payments p
LEFT JOIN public.orders o ON o.id = p.order_id
WHERE p.order_id IS NOT NULL
  AND o.id IS NULL;

SELECT
  (SELECT COUNT(*) FROM public.bookings) AS bookings_total_rows,
  (SELECT COUNT(*) FROM public.orders WHERE booking_id IS NULL) AS orders_booking_id_null_rows,
  (SELECT COUNT(*) FROM public.orders) AS orders_total_rows,
  (SELECT COUNT(*) FROM public.payments) AS payments_total_rows,
  (SELECT COUNT(*) FROM public.payments WHERE order_id IS NULL) AS payments_order_id_null_rows;
