-- Verification SQL for Issue #173 Batch 1 FK hardening
-- Scope:
-- 1) orders.booking_id -> bookings(id)
-- 2) orders.handled_by -> users(id)

-- A) Precheck residual orphans (must be 0)
SELECT
  COUNT(*) FILTER (WHERE o.booking_id IS NOT NULL AND b.id IS NULL) AS orphan_orders_booking_id,
  COUNT(*) FILTER (WHERE o.handled_by IS NOT NULL AND u.id IS NULL) AS orphan_orders_handled_by
FROM public.orders o
LEFT JOIN public.bookings b ON b.id = o.booking_id
LEFT JOIN public.users u ON u.id = o.handled_by;

-- B) Semantic FK presence for each target relationship
WITH fk_pairs AS (
  SELECT
    t.relname AS table_name,
    c.conname,
    c.confdeltype,
    pg_get_constraintdef(c.oid) AS definition,
    array_agg(a.attname ORDER BY ck.ord) AS local_cols,
    rt.relname AS ref_table,
    array_agg(ra.attname ORDER BY ck.ord) AS ref_cols
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_class rt ON rt.oid = c.confrelid
  JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ck.attnum
  JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS rk(attnum, ord) ON rk.ord = ck.ord
  JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = rk.attnum
  WHERE c.contype = 'f'
    AND n.nspname = 'public'
    AND t.relname = 'orders'
  GROUP BY t.relname, c.conname, c.confdeltype, c.oid, rt.relname
)
SELECT
  COUNT(*) FILTER (
    WHERE local_cols = ARRAY['booking_id']
      AND ref_table = 'bookings'
      AND ref_cols = ARRAY['id']
  ) AS booking_fk_count,
  COUNT(*) FILTER (
    WHERE local_cols = ARRAY['handled_by']
      AND ref_table = 'users'
      AND ref_cols = ARRAY['id']
  ) AS handled_by_fk_count,
  ARRAY_AGG(conname ORDER BY conname) AS all_orders_fk_names
FROM fk_pairs;

-- C) Canonical constraints delete-rule check (if canonical names are present)
SELECT
  c.conname,
  CASE c.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete_rule,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE c.contype = 'f'
  AND n.nspname = 'public'
  AND t.relname = 'orders'
  AND c.conname IN ('fk_orders_booking_id', 'fk_orders_handled_by')
ORDER BY c.conname;
