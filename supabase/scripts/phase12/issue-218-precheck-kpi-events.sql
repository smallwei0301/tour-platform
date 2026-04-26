-- Issue #218 precheck contract
-- Purpose: decide whether kpi_settings_history.source_version_id can be FK-enforced,
-- and profile events.session_id as analytics token (non-FK by design).

SELECT NOW() AS generated_at, current_database() AS database_name, current_user AS executed_by;

-- 1) KPI lineage orphan count (eligible for FK only when orphan_count = 0)
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE h.source_version_id IS NULL OR btrim(h.source_version_id) = '') AS null_or_blank_rows,
  COUNT(*) FILTER (
    WHERE h.source_version_id IS NOT NULL
      AND btrim(h.source_version_id) <> ''
  ) AS non_empty_rows,
  COUNT(*) FILTER (
    WHERE h.source_version_id IS NOT NULL
      AND btrim(h.source_version_id) <> ''
      AND p.version_id IS NULL
  ) AS orphan_count
FROM kpi_settings_history h
LEFT JOIN kpi_settings_history p
  ON h.source_version_id = p.version_id;

-- 2) events.session_id null/distinct characteristics (analytics token profile)
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE session_id IS NULL OR btrim(session_id) = '') AS null_or_blank_rows,
  COUNT(*) FILTER (WHERE session_id IS NOT NULL AND btrim(session_id) <> '') AS non_empty_rows,
  COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL AND btrim(session_id) <> '') AS distinct_non_empty_session_id
FROM events;

-- 3) FK existence verification (post-migration sanity)
SELECT
  c.conname,
  pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE c.contype = 'f'
  AND n.nspname = 'public'
  AND t.relname = 'kpi_settings_history'
  AND c.conname = 'fk_kpi_settings_history_source_version_id';

-- 4) Explicit non-FK verification for events.session_id
SELECT
  col_description('public.events'::regclass, a.attnum) AS session_id_comment
FROM pg_attribute a
WHERE a.attrelid = 'public.events'::regclass
  AND a.attname = 'session_id';

SELECT
  COUNT(*) AS fk_count_on_events_session_id
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN LATERAL unnest(c.conkey) AS k(attnum) ON TRUE
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE c.contype = 'f'
  AND n.nspname = 'public'
  AND t.relname = 'events'
  AND a.attname = 'session_id';
