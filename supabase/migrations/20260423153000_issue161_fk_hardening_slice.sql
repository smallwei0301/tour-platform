-- Issue #161 (implementation slice): bounded FK hardening for upgraded DBs
-- Scope (idempotent / migration-safe):
-- 1) Ensure bookings.order_id -> orders(id) FK exists
-- 2) Ensure payments.booking_id column exists + FK -> bookings(id)
-- 3) Deterministic-only backfill: payments.order_id -> payments.booking_id via unique bookings.order_id mapping
--    - Only backfill when order_id maps to exactly 1 booking
--    - Ambiguous mappings (>1 bookings for same order_id) remain NULL

BEGIN;

-- 1) bookings.order_id -> orders(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'order_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'orders'
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

-- 2) payments.booking_id (nullable, additive)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'payments'
  ) THEN
    EXECUTE 'ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS booking_id UUID';
    EXECUTE 'ALTER TABLE public.payments ALTER COLUMN booking_id DROP NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments(booking_id)';
  END IF;
END $$;

-- 2b) payments.booking_id -> bookings(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'booking_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
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

-- 3) deterministic backfill
-- Update only NULL booking_id rows where payments.order_id has exactly one matching booking by bookings.order_id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'order_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'booking_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'order_id'
  ) THEN
    WITH unique_order_booking AS (
      SELECT b.order_id, MIN(b.id) AS booking_id
      FROM public.bookings b
      WHERE b.order_id IS NOT NULL
      GROUP BY b.order_id
      HAVING COUNT(*) = 1
    )
    UPDATE public.payments p
    SET booking_id = uob.booking_id
    FROM unique_order_booking uob
    WHERE p.booking_id IS NULL
      AND p.order_id IS NOT NULL
      AND p.order_id = uob.order_id;
  END IF;
END $$;

COMMIT;
