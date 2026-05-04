-- Issue #217 Option-B guardrail checks (linked Supabase / single-result-set variant)
-- Purpose: return all proof metrics in one final table because Management API surfaces only one result set.

BEGIN;

CREATE TEMP TABLE issue_217_metrics (
  ord integer,
  metric text,
  value text
) ON COMMIT DROP;

INSERT INTO issue_217_metrics(ord, metric, value)
SELECT 10, 'generated_at', NOW()::text
UNION ALL
SELECT 11, 'database_name', current_database()::text
UNION ALL
SELECT 12, 'executed_by', current_user::text;

INSERT INTO issue_217_metrics(ord, metric, value)
SELECT 20, 'snapshot_plan_id_column_type', data_type::text
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'activity_availability_daily' AND column_name = 'plan_id'
UNION ALL
SELECT 21, 'activity_plans_id_column_type', data_type::text
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'activity_plans' AND column_name = 'id';

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
INSERT INTO issue_217_metrics(ord, metric, value)
SELECT 30, 'snapshot_total_rows', total_rows::text FROM snap
UNION ALL SELECT 31, 'snapshot_null_rows', null_rows::text FROM snap
UNION ALL SELECT 32, 'snapshot_blank_rows', blank_rows::text FROM snap
UNION ALL SELECT 33, 'snapshot_distinct_non_blank_plan_ids', distinct_non_blank_plan_ids::text FROM snap
UNION ALL SELECT 34, 'schedule_total_rows', total_rows::text FROM sch
UNION ALL SELECT 35, 'schedule_null_rows', null_rows::text FROM sch
UNION ALL SELECT 36, 'schedule_blank_rows', blank_rows::text FROM sch
UNION ALL SELECT 37, 'schedule_distinct_non_blank_plan_ids', distinct_non_blank_plan_ids::text FROM sch;

WITH snap_ids AS (
  SELECT DISTINCT NULLIF(btrim(plan_id), '') AS plan_id
  FROM activity_availability_daily
  WHERE plan_id IS NOT NULL
), sch_ids AS (
  SELECT DISTINCT NULLIF(btrim(plan_id), '') AS plan_id
  FROM activity_schedules
  WHERE plan_id IS NOT NULL
)
INSERT INTO issue_217_metrics(ord, metric, value)
SELECT 40, 'snapshot_plan_ids_not_in_schedules', COUNT(*)::text
FROM snap_ids s
LEFT JOIN sch_ids k ON s.plan_id = k.plan_id
WHERE s.plan_id IS NOT NULL AND k.plan_id IS NULL
UNION ALL
SELECT 41, 'schedule_plan_ids_not_in_snapshot', COUNT(*)::text
FROM sch_ids k
LEFT JOIN snap_ids s ON s.plan_id = k.plan_id
WHERE k.plan_id IS NOT NULL AND s.plan_id IS NULL;

WITH snapshot_distinct AS (
  SELECT DISTINCT NULLIF(btrim(plan_id), '') AS plan_id
  FROM activity_availability_daily
  WHERE plan_id IS NOT NULL
)
INSERT INTO issue_217_metrics(ord, metric, value)
SELECT 50, 'snapshot_plan_id_to_activity_plans_slug_match_count', COUNT(*)::text
FROM snapshot_distinct s
JOIN activity_plans p ON p.slug = s.plan_id
UNION ALL
SELECT 51, 'snapshot_plan_id_without_activity_plans_slug_match_count', COUNT(*)::text
FROM snapshot_distinct s
LEFT JOIN activity_plans p ON p.slug = s.plan_id
WHERE p.id IS NULL;

DO $$
BEGIN
  IF to_regprocedure('fn_refresh_activity_availability_daily(uuid,date,date)') IS NULL THEN
    RAISE EXCEPTION 'fn_refresh_activity_availability_daily(uuid,date,date) not found';
  END IF;
END $$;

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
INSERT INTO issue_217_metrics(ord, metric, value)
SELECT 60, 'refresh_probe_invocation', c.activity_id::text || '|' || c.date_from::text || '|' || c.date_to::text
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

INSERT INTO issue_217_metrics(ord, metric, value)
VALUES (99, 'issue_217_guardrail_pack_completed', 'true');

SELECT metric, value
FROM issue_217_metrics
ORDER BY ord, metric;

ROLLBACK;
