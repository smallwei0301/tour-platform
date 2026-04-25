-- Issue #216 [Phase 12][P0][FK][Batch1]
-- Normalize order_items booking linkage for booking rows only.
-- Scope:
-- 1) add nullable order_items.booking_id (typed linkage)
-- 2) backfill booking_id from legacy ref_id for activity_booking rows
-- 3) precheck orphan count = 0 for activity_booking rows
-- 4) enforce FK order_items.booking_id -> bookings.id
-- 5) keep non-booking rows FK-free (booking_id remains nullable for non activity_booking)

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS booking_id uuid;

-- Backfill only booking line rows from legacy ref_id.
UPDATE public.order_items oi
SET
  booking_id = oi.ref_id
WHERE oi.item_type = 'activity_booking'
  AND oi.booking_id IS NULL
  AND oi.ref_id IS NOT NULL;

-- Guardrail: activity_booking rows must not have orphan booking_id before FK enforcement.
DO $$
DECLARE
  orphan_count bigint;
BEGIN
  SELECT COUNT(*)
    INTO orphan_count
  FROM public.order_items oi
  LEFT JOIN public.bookings b ON b.id = oi.booking_id
  WHERE oi.item_type = 'activity_booking'
    AND oi.booking_id IS NOT NULL
    AND b.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      USING MESSAGE = format(
        'Issue #216 precheck failed: order_items.activity_booking has %s orphan booking_id row(s); cleanup required before FK enforcement',
        orphan_count
      );
  END IF;
END $$;

-- Index for booking-linked rows.
CREATE INDEX IF NOT EXISTS idx_order_items_booking_id
  ON public.order_items (booking_id)
  WHERE booking_id IS NOT NULL;

-- Enforce typed FK. Keep nullable to preserve non-booking row flexibility.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'order_items'
      AND c.conname = 'fk_order_items_booking_id'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT fk_order_items_booking_id
      FOREIGN KEY (booking_id)
      REFERENCES public.bookings(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Optional semantic guard: activity_booking rows require booking_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'order_items'
      AND c.conname = 'ck_order_items_booking_required_for_activity_booking'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT ck_order_items_booking_required_for_activity_booking
      CHECK (item_type <> 'activity_booking' OR booking_id IS NOT NULL);
  END IF;
END $$;
