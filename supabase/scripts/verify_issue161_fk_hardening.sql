-- Verification SQL for Issue #161 bounded FK hardening (upgraded DB path)
-- Covers:
-- 1) FK presence
-- 2) payments.booking_id column presence
-- 3) deterministic backfill outcome (resolved/ambiguous)
-- 4) residual mismatch/orphan counts

-- A) FK presence (explicit names)
SELECT
  EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'bookings'
      AND c.conname = 'fk_bookings_order_id'
  ) AS has_fk_bookings_order_id,
  EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'payments'
      AND c.conname = 'fk_payments_booking_id'
  ) AS has_fk_payments_booking_id;

-- B) Column presence
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'booking_id'
  ) AS has_payments_booking_id_column;

-- C) Backfill determinism accounting
WITH booking_map AS (
  SELECT order_id, COUNT(*) AS booking_count, MIN(id) AS singleton_booking_id
  FROM public.bookings
  WHERE order_id IS NOT NULL
  GROUP BY order_id
), payment_order_rows AS (
  SELECT p.id, p.order_id, p.booking_id, bm.booking_count, bm.singleton_booking_id
  FROM public.payments p
  LEFT JOIN booking_map bm ON bm.order_id = p.order_id
  WHERE p.order_id IS NOT NULL
)
SELECT
  COUNT(*) FILTER (WHERE booking_count = 1) AS payment_rows_with_unique_mapping,
  COUNT(*) FILTER (WHERE booking_count = 1 AND booking_id IS NOT NULL) AS unique_mapping_backfilled_or_prelinked,
  COUNT(*) FILTER (WHERE booking_count > 1) AS payment_rows_with_ambiguous_mapping,
  COUNT(*) FILTER (WHERE booking_count > 1 AND booking_id IS NULL) AS ambiguous_rows_kept_null,
  COUNT(*) FILTER (WHERE booking_count IS NULL) AS payment_rows_without_matching_booking_order,
  COUNT(*) FILTER (
    WHERE booking_count = 1
      AND booking_id IS NOT NULL
      AND booking_id <> singleton_booking_id
  ) AS unique_mapping_wrong_booking_id
FROM payment_order_rows;

-- D) Residual relational mismatch checks
SELECT
  COUNT(*) AS payments_booking_id_orphan_count
FROM public.payments p
LEFT JOIN public.bookings b ON b.id = p.booking_id
WHERE p.booking_id IS NOT NULL
  AND b.id IS NULL;

SELECT
  COUNT(*) AS payments_with_order_id_but_booking_id_null
FROM public.payments
WHERE order_id IS NOT NULL
  AND booking_id IS NULL;
