-- issue #161: bounded FK hardening for upgraded DBs
-- Scope (bounded):
-- 1) enforce bookings.order_id -> orders(id) FK with idempotent/migration-safe DDL
-- 2) add payments.booking_id + FK wiring to bookings(id)
-- 3) deterministic-only backfill from payments.order_id -> bookings.order_id
--    (only when one-and-only-one booking matches the order_id)

BEGIN;

-- 1) bookings.order_id FK (idempotent + upgraded-path safe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'bookings'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'orders'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class t ON t.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'bookings'
      AND a.attname = 'order_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'bookings'
      AND c.conname = 'fk_bookings_order_id'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT fk_bookings_order_id
      FOREIGN KEY (order_id)
      REFERENCES public.orders(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 2) payments.booking_id additive rollout (nullable)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS booking_id UUID;

ALTER TABLE public.payments
  ALTER COLUMN booking_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_booking_id
  ON public.payments(booking_id);

-- 3) deterministic-only backfill: payments.order_id -> bookings.order_id
-- Rules:
-- - only backfill rows where payments.booking_id IS NULL
-- - only backfill when exactly one booking matches the payment.order_id
-- - ambiguous mappings remain NULL by design
WITH deterministic_mapping AS (
  SELECT
    p.id AS payment_id,
    MIN(b.id) AS booking_id
  FROM public.payments p
  JOIN public.bookings b
    ON b.order_id = p.order_id
  WHERE p.booking_id IS NULL
    AND p.order_id IS NOT NULL
  GROUP BY p.id
  HAVING COUNT(b.id) = 1
)
UPDATE public.payments p
SET booking_id = m.booking_id,
    updated_at = COALESCE(p.updated_at, now())
FROM deterministic_mapping m
WHERE p.id = m.payment_id
  AND p.booking_id IS NULL;

-- 4) payments.booking_id FK wiring (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'payments'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'bookings'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class t ON t.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'payments'
      AND a.attname = 'booking_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'payments'
      AND c.conname = 'fk_payments_booking_id'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT fk_payments_booking_id
      FOREIGN KEY (booking_id)
      REFERENCES public.bookings(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
