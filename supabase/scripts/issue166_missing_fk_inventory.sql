-- Issue #166 inventory helper: inspect selected remaining relational columns
-- Inventory-only: no schema mutation

\pset footer off
\timing on

SELECT NOW() AS generated_at, current_database() AS database_name, current_user AS executed_by;

-- A) FK presence check for known already-landed constraints (#172/#173 baseline)
WITH fk_pairs AS (
  SELECT
    c.conname,
    n1.nspname AS schema_name,
    cl.relname AS table_name,
    a.attname AS column_name,
    n2.nspname AS ref_schema,
    clf.relname AS ref_table,
    af.attname AS ref_column
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n1 ON n1.oid = cl.relnamespace
  JOIN pg_class clf ON clf.oid = c.confrelid
  JOIN pg_namespace n2 ON n2.oid = clf.relnamespace
  JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS ck(attnum, ord) ON TRUE
  JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS rk(attnum, ord) ON rk.ord = ck.ord
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ck.attnum
  JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = rk.attnum
  WHERE c.contype = 'f'
)
SELECT *
FROM fk_pairs
WHERE (table_name, column_name) IN (
  ('bookings','order_id'),
  ('payments','booking_id'),
  ('orders','booking_id'),
  ('orders','handled_by')
)
ORDER BY table_name, column_name, conname;

-- B) Remaining candidates (runtime data profile)
SELECT
  'order_items.ref_id' AS candidate,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE ref_id IS NULL) AS null_rows,
  COUNT(*) FILTER (WHERE item_type = 'activity_booking') AS booking_line_rows,
  COUNT(*) FILTER (WHERE item_type = 'activity_booking' AND ref_id IS NULL) AS booking_line_null_ref
FROM order_items
UNION ALL
SELECT
  'activity_availability_daily.plan_id',
  COUNT(*),
  COUNT(*) FILTER (WHERE plan_id IS NULL),
  NULL::bigint,
  NULL::bigint
FROM activity_availability_daily
UNION ALL
SELECT
  'kpi_settings_history.source_version_id',
  COUNT(*),
  COUNT(*) FILTER (WHERE source_version_id IS NULL),
  NULL::bigint,
  NULL::bigint
FROM kpi_settings_history
UNION ALL
SELECT
  'events.session_id',
  COUNT(*),
  COUNT(*) FILTER (WHERE session_id IS NULL),
  NULL::bigint,
  NULL::bigint
FROM events;

-- C) Optional orphan checks for candidates with plausible parent
SELECT
  'kpi_settings_history.source_version_id -> kpi_settings_history.version_id' AS relation,
  COUNT(*) AS orphan_count
FROM kpi_settings_history h
LEFT JOIN kpi_settings_history p ON h.source_version_id = p.version_id
WHERE h.source_version_id IS NOT NULL
  AND btrim(h.source_version_id) <> ''
  AND p.version_id IS NULL;

SELECT
  'order_items.ref_id (item_type=activity_booking) -> bookings.id' AS relation,
  COUNT(*) AS orphan_count
FROM order_items oi
LEFT JOIN bookings b ON oi.ref_id = b.id
WHERE oi.item_type = 'activity_booking'
  AND oi.ref_id IS NOT NULL
  AND b.id IS NULL;
