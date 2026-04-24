-- Issue #173: Batch 1 truth-first FK hardening (booking-critical, bounded)
-- Scope (bounded, no model redesign):
-- 1) orders.booking_id -> bookings(id)
-- 2) orders.handled_by -> users(id)
--
-- Notes:
-- - Intentionally does NOT touch payments.booking_id redesign/new columns (handled in #161 slice).
-- - Uses semantic existence checks to avoid duplicate-equivalent FKs with different names.
-- - Uses precheck orphan guards before adding constraints to avoid deploy-time surprises.

DO $$
DECLARE
  orphan_orders_booking_id bigint;
  orphan_orders_handled_by bigint;
BEGIN
  -- ------------------------------------------------------------
  -- Precheck 1: orders.booking_id orphan rows (only for non-null values)
  -- ------------------------------------------------------------
  SELECT COUNT(*)
    INTO orphan_orders_booking_id
  FROM public.orders o
  LEFT JOIN public.bookings b ON b.id = o.booking_id
  WHERE o.booking_id IS NOT NULL
    AND b.id IS NULL;

  IF orphan_orders_booking_id > 0 THEN
    RAISE EXCEPTION
      USING MESSAGE = format(
        'Issue #173 precheck failed: orders.booking_id has %s orphan row(s); backfill/cleanup required before FK enforcement',
        orphan_orders_booking_id
      );
  END IF;

  -- ------------------------------------------------------------
  -- Precheck 2: orders.handled_by orphan rows (only for non-null values)
  -- ------------------------------------------------------------
  SELECT COUNT(*)
    INTO orphan_orders_handled_by
  FROM public.orders o
  LEFT JOIN public.users u ON u.id = o.handled_by
  WHERE o.handled_by IS NOT NULL
    AND u.id IS NULL;

  IF orphan_orders_handled_by > 0 THEN
    RAISE EXCEPTION
      USING MESSAGE = format(
        'Issue #173 precheck failed: orders.handled_by has %s orphan row(s); backfill/cleanup required before FK enforcement',
        orphan_orders_handled_by
      );
  END IF;
END $$;

-- --------------------------------------------------------------
-- 1) orders.booking_id -> bookings(id)
-- --------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'booking_id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'orders'
      AND c.conkey = ARRAY(
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'public.orders'::regclass
          AND attname = 'booking_id'
          AND attnum > 0
          AND NOT attisdropped
      )
      AND c.confrelid = 'public.bookings'::regclass
      AND c.confkey = ARRAY(
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'public.bookings'::regclass
          AND attname = 'id'
          AND attnum > 0
          AND NOT attisdropped
      )
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT fk_orders_booking_id
      FOREIGN KEY (booking_id)
      REFERENCES public.bookings(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- --------------------------------------------------------------
-- 2) orders.handled_by -> users(id)
-- --------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'handled_by'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'orders'
      AND c.conkey = ARRAY(
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'public.orders'::regclass
          AND attname = 'handled_by'
          AND attnum > 0
          AND NOT attisdropped
      )
      AND c.confrelid = 'public.users'::regclass
      AND c.confkey = ARRAY(
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'public.users'::regclass
          AND attname = 'id'
          AND attnum > 0
          AND NOT attisdropped
      )
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT fk_orders_handled_by
      FOREIGN KEY (handled_by)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;
