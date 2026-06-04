-- GH-1067: explicit year-round activity plan contract
-- Distinguish deliberate year-round availability from missing/disabled season configuration.

ALTER TABLE activity_plans
  ADD COLUMN IF NOT EXISTS is_year_round BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN activity_plans.is_year_round IS 'Explicit year-round availability flag. False means season availability must come from active activity_plan_seasons rows.';
