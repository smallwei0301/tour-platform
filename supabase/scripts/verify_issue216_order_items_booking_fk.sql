-- Verify Issue #216 Batch1 FK slice
-- 1) booking rows are backfilled and orphan-free
-- 2) fk_order_items_booking_id exists
-- 3) non-booking rows can remain NULL booking_id

SELECT
  COUNT(*) FILTER (WHERE oi.item_type = 'activity_booking') AS booking_rows,
  COUNT(*) FILTER (WHERE oi.item_type = 'activity_booking' AND oi.booking_id IS NULL) AS booking_rows_missing_booking_id,
  COUNT(*) FILTER (
    WHERE oi.item_type = 'activity_booking'
      AND oi.booking_id IS NOT NULL
      AND b.id IS NULL
  ) AS booking_rows_orphan_booking_id,
  COUNT(*) FILTER (WHERE oi.item_type <> 'activity_booking' AND oi.booking_id IS NULL) AS non_booking_rows_null_booking_id
FROM public.order_items oi
LEFT JOIN public.bookings b ON b.id = oi.booking_id;

SELECT
  c.conname,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'order_items'
  AND c.conname IN (
    'fk_order_items_booking_id',
    'ck_order_items_booking_required_for_activity_booking'
  )
ORDER BY c.conname;

SELECT
  i.relname AS index_name,
  pg_get_indexdef(i.oid) AS index_def
FROM pg_class t
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_index x ON x.indrelid = t.oid
JOIN pg_class i ON i.oid = x.indexrelid
WHERE n.nspname = 'public'
  AND t.relname = 'order_items'
  AND i.relname = 'idx_order_items_booking_id';
