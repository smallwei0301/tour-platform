-- Issue #172: bounded migration-safe FK rollout
-- Scope:
-- 1) add FK bookings.order_id -> orders(id)
-- 2) add nullable payments.booking_id if missing
-- 3) add FK payments.booking_id -> bookings(id)
-- 4) keep payments.booking_id nullable (no historical backfill / no NOT NULL in this issue)

BEGIN;

-- 1) bookings.order_id FK (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
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

-- 2) payments.booking_id column first (nullable, additive)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS booking_id UUID;

-- Ensure nullable in #172 (if older schema had NOT NULL)
ALTER TABLE public.payments
  ALTER COLUMN booking_id DROP NOT NULL;

-- Optional supporting index (safe if already present)
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments(booking_id);

-- 3) payments.booking_id FK (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
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
