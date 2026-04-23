-- issue #161 verification SQL (upgraded DB path)
-- Run after applying migration:
--   supabase/migrations/20260423142000_issue_161_fk_hardening.sql

-- 1) Named FK presence checks
SELECT
  c.conname,
  src.relname AS table_name,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class src ON src.oid = c.conrelid
JOIN pg_namespace n ON n.oid = src.relnamespace
WHERE n.nspname = 'public'
  AND c.contype = 'f'
  AND c.conname IN ('fk_bookings_order_id', 'fk_payments_booking_id')
ORDER BY c.conname;

-- 2) payments.booking_id semantic uniqueness + ON DELETE semantics
WITH semantic_fks AS (
  SELECT
    c.conname,
    c.confdeltype,
    pg_get_constraintdef(c.oid) AS definition
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
  BOOL_AND(conname = 'fk_payments_booking_id') AS all_named_fk_payments_booking_id,
  BOOL_AND(confdeltype = 'n') AS all_on_delete_set_null,
  ARRAY_AGG(conname ORDER BY conname) AS semantic_fk_names,
  ARRAY_AGG(definition ORDER BY conname) AS semantic_fk_definitions
FROM semantic_fks;

-- 3) payments.booking_id column presence / nullability
SELECT
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payments'
  AND column_name = 'booking_id';

-- 4) deterministic residual counts (NULL + ambiguous + mismatch)
WITH ambiguous_orders AS (
  SELECT b.order_id
  FROM public.bookings b
  WHERE b.order_id IS NOT NULL
  GROUP BY b.order_id
  HAVING COUNT(*) > 1
),
payment_profile AS (
  SELECT
    p.id,
    p.order_id,
    p.booking_id,
    (p.order_id IS NOT NULL AND p.booking_id IS NULL) AS unresolved_order_link,
    EXISTS (
      SELECT 1 FROM ambiguous_orders ao WHERE ao.order_id = p.order_id
    ) AS is_ambiguous_order,
    (p.booking_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.bookings b WHERE b.id = p.booking_id
    )) AS booking_fk_mismatch
  FROM public.payments p
)
SELECT
  COUNT(*) FILTER (WHERE unresolved_order_link) AS payment_order_link_unresolved,
  COUNT(*) FILTER (WHERE unresolved_order_link AND is_ambiguous_order) AS unresolved_due_to_ambiguous_mapping,
  COUNT(*) FILTER (WHERE unresolved_order_link AND NOT is_ambiguous_order) AS unresolved_non_ambiguous_should_be_zero,
  COUNT(*) FILTER (WHERE booking_fk_mismatch) AS payment_booking_fk_mismatch
FROM payment_profile;

-- 5) upgraded-path correctness sample rows (inspect unresolved links)
SELECT
  p.id AS payment_id,
  p.order_id,
  p.booking_id,
  (SELECT COUNT(*) FROM public.bookings b WHERE b.order_id = p.order_id) AS bookings_per_order
FROM public.payments p
WHERE p.order_id IS NOT NULL
  AND p.booking_id IS NULL
ORDER BY p.created_at DESC
LIMIT 50;
