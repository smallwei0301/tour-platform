-- Verification SQL for Issue #161 FK hardening (upgraded DB path)
-- Covers:
-- 1) Named FK presence
-- 2) Semantic uniqueness: exactly one payments.booking_id -> bookings.id FK
-- 3) Final ON DELETE semantics for payments.booking_id FK = SET NULL
-- 4) payments.booking_id column presence
-- 5) deterministic backfill outcome (resolved/ambiguous)
-- 6) residual mismatch/orphan counts

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

-- B) Semantic FK uniqueness + final delete-rule check for payments.booking_id -> bookings.id
WITH semantic_fks AS (
  SELECT
    c.conname,
    c.confdeltype
  FROM pg_constraint c
  JOIN pg_class src ON src.oid = c.conrelid
  JOIN pg_namespace src_n ON src_n.oid = src.relnamespace
  JOIN pg_class tgt ON tgt.oid = c.confrelid
  JOIN pg_namespace tgt_n ON tgt_n.oid = tgt.relnamespace
  WHERE c.contype = 'f'
    AND src_n.nspname = 'public'
    AND src.relname = 'payments'
    AND tgt_n.nspname = 'public'
    AND tgt.relname = 'bookings'
    AND c.conkey = ARRAY(
      SELECT a.attnum
      FROM pg_attribute a
      JOIN pg_class t ON t.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'payments'
        AND a.attname = 'booking_id'
        AND a.attnum > 0
        AND NOT a.attisdropped
    )
    AND c.confkey = ARRAY(
      SELECT a.attnum
      FROM pg_attribute a
      JOIN pg_class t ON t.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'bookings'
        AND a.attname = 'id'
        AND a.attnum > 0
        AND NOT a.attisdropped
    )
)
SELECT
  COUNT(*) AS semantic_fk_count,
  BOOL_AND(conname = 'fk_payments_booking_id') AS all_semantic_fk_named_canonical,
  BOOL_AND(confdeltype = 'n') AS all_semantic_fk_on_delete_set_null,
  ARRAY_AGG(conname ORDER BY conname) AS semantic_fk_names
FROM semantic_fks;

-- C) Column presence
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'booking_id'
  ) AS has_payments_booking_id_column;

-- D) Backfill determinism accounting
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

-- E) Residual relational mismatch checks
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
