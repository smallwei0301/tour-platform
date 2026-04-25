-- Rollback for Issue #216 batch1 order_items booking FK slice

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS ck_order_items_booking_required_for_activity_booking;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS fk_order_items_booking_id;

DROP INDEX IF EXISTS public.idx_order_items_booking_id;

ALTER TABLE public.order_items
  DROP COLUMN IF EXISTS booking_id;
