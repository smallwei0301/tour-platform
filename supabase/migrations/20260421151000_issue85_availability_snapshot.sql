-- issue #85: activity availability snapshot / aggregate table

CREATE TABLE IF NOT EXISTS activity_availability_daily (
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  date date NOT NULL,
  -- NULL means "all plans aggregated" for that day; non-null means plan-specific row
  plan_id text NULL,
  total_capacity integer NOT NULL DEFAULT 0,
  total_booked integer NOT NULL DEFAULT 0,
  remaining integer NOT NULL DEFAULT 0,
  is_open boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, date, plan_id)
);

CREATE INDEX IF NOT EXISTS activity_availability_daily_lookup_idx
  ON activity_availability_daily(activity_id, date, is_open);

CREATE INDEX IF NOT EXISTS activity_availability_daily_date_idx
  ON activity_availability_daily(date, is_open);

CREATE OR REPLACE FUNCTION fn_refresh_activity_availability_daily(
  p_activity_id uuid,
  p_date_from date DEFAULT CURRENT_DATE,
  p_date_to date DEFAULT (CURRENT_DATE + INTERVAL '90 days')::date
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted integer := 0;
  v_inserted integer := 0;
BEGIN
  IF p_activity_id IS NULL THEN
    RAISE EXCEPTION 'p_activity_id is required';
  END IF;

  DELETE FROM activity_availability_daily
   WHERE activity_id = p_activity_id
     AND date BETWEEN p_date_from AND p_date_to;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  WITH base AS (
    SELECT
      s.activity_id,
      (s.start_at AT TIME ZONE 'Asia/Taipei')::date AS date,
      s.plan_id,
      GREATEST(COALESCE(s.capacity, 0), 0) AS capacity,
      GREATEST(COALESCE(s.booked_count, 0), 0) AS booked,
      COALESCE(s.status, 'open') AS status
    FROM activity_schedules s
    WHERE s.activity_id = p_activity_id
      AND (s.start_at AT TIME ZONE 'Asia/Taipei')::date BETWEEN p_date_from AND p_date_to
  ),
  by_plan AS (
    SELECT
      activity_id,
      date,
      plan_id,
      SUM(capacity)::int AS total_capacity,
      SUM(booked)::int AS total_booked,
      GREATEST(SUM(capacity) - SUM(booked), 0)::int AS remaining,
      BOOL_OR(status = 'open') AND (SUM(capacity) - SUM(booked) > 0) AS is_open
    FROM base
    GROUP BY activity_id, date, plan_id
  ),
  all_plan AS (
    SELECT
      activity_id,
      date,
      NULL::text AS plan_id,
      SUM(capacity)::int AS total_capacity,
      SUM(booked)::int AS total_booked,
      GREATEST(SUM(capacity) - SUM(booked), 0)::int AS remaining,
      BOOL_OR(status = 'open') AND (SUM(capacity) - SUM(booked) > 0) AS is_open
    FROM base
    GROUP BY activity_id, date
  )
  INSERT INTO activity_availability_daily(activity_id, date, plan_id, total_capacity, total_booked, remaining, is_open, updated_at)
  SELECT activity_id, date, plan_id, total_capacity, total_booked, remaining, is_open, now() FROM by_plan
  UNION ALL
  SELECT activity_id, date, plan_id, total_capacity, total_booked, remaining, is_open, now() FROM all_plan;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION fn_refresh_activity_availability_daily_by_schedule_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_activity_id uuid;
  v_date_from date;
  v_date_to date;
BEGIN
  v_activity_id := COALESCE(NEW.activity_id, OLD.activity_id);
  v_date_from := LEAST(
    COALESCE((NEW.start_at AT TIME ZONE 'Asia/Taipei')::date, CURRENT_DATE),
    COALESCE((OLD.start_at AT TIME ZONE 'Asia/Taipei')::date, CURRENT_DATE)
  );
  v_date_to := GREATEST(
    COALESCE((NEW.start_at AT TIME ZONE 'Asia/Taipei')::date, CURRENT_DATE),
    COALESCE((OLD.start_at AT TIME ZONE 'Asia/Taipei')::date, CURRENT_DATE)
  );

  PERFORM fn_refresh_activity_availability_daily(v_activity_id, v_date_from, v_date_to);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_activity_availability_daily ON activity_schedules;
CREATE TRIGGER trg_refresh_activity_availability_daily
AFTER INSERT OR UPDATE OR DELETE ON activity_schedules
FOR EACH ROW
EXECUTE FUNCTION fn_refresh_activity_availability_daily_by_schedule_change();

-- initial backfill for next 90 days of all activities
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM activities LOOP
    PERFORM fn_refresh_activity_availability_daily(r.id, CURRENT_DATE, (CURRENT_DATE + INTERVAL '90 days')::date);
  END LOOP;
END $$;
