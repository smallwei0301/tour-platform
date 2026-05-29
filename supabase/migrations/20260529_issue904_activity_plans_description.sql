-- GH-904: add the activity_plans.description column (additive, idempotent)
--
-- The admin plan create/update routes and the JSON-import backfill all send a
-- `description` field, but it was never covered by a migration (the rich-fields
-- migration 20260527_issue841_activity_plans_rich_fields.sql added the other 18
-- rich columns but not this one). On environments where it is missing the code
-- degrades gracefully (PR #915 drops the column and warns), but the value is then
-- lost. This migration closes that gap so plan descriptions persist everywhere.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is a no-op when the column already
-- exists (e.g. production, where it was applied manually on 2026-05-29).

ALTER TABLE activity_plans
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN activity_plans.description IS 'Plan description shown in admin editor and booking surfaces (GH-904)';
