-- issue #161 verification SQL (upgraded DB path)
-- Run after applying migration:
--   supabase/migrations/20260423142000_issue_161_fk_hardening.sql

-- 1) FK presence checks
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

-- 2) payments.booking_id column presence / nullability
SELECT
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payments'
  AND column_name = 'booking_id';

-- 3) deterministic residual counts (NULL + ambiguous + mismatch)
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

-- 4) upgraded-path correctness sample rows (inspect unresolved links)
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
