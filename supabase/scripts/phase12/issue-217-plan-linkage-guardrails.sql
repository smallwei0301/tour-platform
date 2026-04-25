-- Issue #217 Option-B guardrail checks
-- Decision: activity_availability_daily.plan_id remains a non-FK semantic snapshot key.
-- This pack is rerunnable and read-mostly. It verifies data profile + mismatch risk + refresh-function safety.

\pset footer off
\timing on

SELECT NOW() AS generated_at, current_database() AS database_name, current_user AS executed_by;

-- 1) Explicit model evidence: column types differ by design (text semantic key vs uuid canonical booking plan id)
SELECT
  'snapshot_plan_id_column_type' AS metric,
  data_type::text AS value
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'activity_availability_daily' AND column_name = 'plan_id'
UNION ALL
SELECT
  'activity_plans_id_column_type' AS metric,
  data_type::text AS value
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'activity_plans' AND column_name = 'id';

-- 2) Cardinality + null-rate prechecks (snapshot vs schedule source)
WITH snap AS (
  SELECT
    COUNT(*)::bigint AS total_rows,
    COUNT(*) FILTER (WHERE plan_id IS NULL)::bigint AS null_rows,
    COUNT(*) FILTER (WHERE plan_id IS NOT NULL AND btrim(plan_id) = '')::bigint AS blank_rows,
    COUNT(DISTINCT NULLIF(btrim(plan_id), ''))::bigint AS distinct_non_blank_plan_ids
  FROM activity_availability_daily
), sch AS (
  SELECT
    COUNT(*)::bigint AS total_rows,
    COUNT(*) FILTER (WHERE plan_id IS NULL)::bigint AS null_rows,
    COUNT(*) FILTER (WHERE plan_id IS NOT NULL AND btrim(plan_id) = '')::bigint AS blank_rows,
    COUNT(DISTINCT NULLIF(btrim(plan_id), ''))::bigint AS distinct_non_blank_plan_ids
  FROM activity_schedules
)
SELECT 'snapshot_total_rows' AS metric, total_rows::text AS value FROM snap
UNION ALL SELECT 'snapshot_null_rows', null_rows::text FROM snap
UNION ALL SELECT 'snapshot_blank_rows', blank_rows::text FROM snap
UNION ALL SELECT 'snapshot_distinct_non_blank_plan_ids', distinct_non_blank_plan_ids::text FROM snap
UNION ALL SELECT 'schedule_total_rows', total_rows::text FROM sch
UNION ALL SELECT 'schedule_null_rows', null_rows::text FROM sch
UNION ALL SELECT 'schedule_blank_rows', blank_rows::text FROM sch
UNION ALL SELECT 'schedule_distinct_non_blank_plan_ids', distinct_non_blank_plan_ids::text FROM sch;

-- 3) Cross-source mismatch prechecks (semantic key set differences)
WITH snap_ids AS (
  SELECT DISTINCT NULLIF(btrim(plan_id), '') AS plan_id
  FROM activity_availability_daily
  WHERE plan_id IS NOT NULL
), sch_ids AS (
  SELECT DISTINCT NULLIF(btrim(plan_id), '') AS plan_id
  FROM activity_schedules
  WHERE plan_id IS NOT NULL
)
SELECT
  'snapshot_plan_ids_not_in_schedules' AS metric,
  COUNT(*)::text AS value
FROM snap_ids s
LEFT JOIN sch_ids k ON s.plan_id = k.plan_id
WHERE s.plan_id IS NOT NULL
  AND k.plan_id IS NULL
UNION ALL
SELECT
  'schedule_plan_ids_not_in_snapshot' AS metric,
  COUNT(*)::text AS value
FROM sch_ids k
LEFT JOIN snap_ids s ON s.plan_id = k.plan_id
WHERE k.plan_id IS NOT NULL
  AND s.plan_id IS NULL;

-- 4) Optional diagnostic map to activity_plans.slug (not an FK assertion, only observability)
WITH snapshot_distinct AS (
  SELECT DISTINCT NULLIF(btrim(plan_id), '') AS plan_id
  FROM activity_availability_daily
  WHERE plan_id IS NOT NULL
)
SELECT
  'snapshot_plan_id_to_activity_plans_slug_match_count' AS metric,
  COUNT(*)::text AS value
FROM snapshot_distinct s
JOIN activity_plans p ON p.slug = s.plan_id
UNION ALL
SELECT
  'snapshot_plan_id_without_activity_plans_slug_match_count' AS metric,
  COUNT(*)::text AS value
FROM snapshot_distinct s
LEFT JOIN activity_plans p ON p.slug = s.plan_id
WHERE p.id IS NULL;

-- 5) Guardrail: verify refresh function exists and can execute safely in a rollback-only transaction
DO $$
BEGIN
  IF to_regprocedure('fn_refresh_activity_availability_daily(uuid,date,date)') IS NULL THEN
    RAISE EXCEPTION 'fn_refresh_activity_availability_daily(uuid,date,date) not found';
  END IF;
END $$;

BEGIN;
WITH candidate AS (
  SELECT a.id AS activity_id,
         COALESCE(MIN(fn_schedule_date(s.start_at)), CURRENT_DATE) AS date_from,
         COALESCE(MAX(fn_schedule_date(s.start_at)), CURRENT_DATE) AS date_to
  FROM activities a
  LEFT JOIN activity_schedules s ON s.activity_id = a.id
  GROUP BY a.id
  ORDER BY COUNT(s.*) DESC, a.id
  LIMIT 1
)
SELECT
  'refresh_probe_invocation' AS metric,
  c.activity_id::text || '|' || c.date_from::text || '|' || c.date_to::text AS value
FROM candidate c;

WITH candidate AS (
  SELECT a.id AS activity_id,
         COALESCE(MIN(fn_schedule_date(s.start_at)), CURRENT_DATE) AS date_from,
         COALESCE(MAX(fn_schedule_date(s.start_at)), CURRENT_DATE) AS date_to
  FROM activities a
  LEFT JOIN activity_schedules s ON s.activity_id = a.id
  GROUP BY a.id
  ORDER BY COUNT(s.*) DESC, a.id
  LIMIT 1
)
SELECT fn_refresh_activity_availability_daily(c.activity_id, c.date_from, c.date_to)
FROM candidate c;
ROLLBACK;

SELECT 'issue_217_guardrail_pack_completed' AS metric, 'true' AS value;