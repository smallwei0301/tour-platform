-- GH-1238 fix: add `name` column to activity_plan_seasons.
--
-- The original migration (20260602_issue1067_activity_plan_seasons.sql) created
-- the table WITHOUT a `name` column, but the API + UI both require it:
--   - apps/web/src/lib/activity-plan-seasons.ts:89 — validator rejects empty name
--   - apps/web/src/lib/activity-plan-seasons.ts:138 — update path writes `name`
--   - apps/web/app/admin/activities/[id]/plans/page.tsx — season manager exposes
--     a name input to operators
--
-- Result on production today: every admin POST /api/v2/admin/.../seasons
-- returned PGRST204 "Could not find the 'name' column of
-- 'activity_plan_seasons' in the schema cache", which the route mapped to a
-- generic 500 INTERNAL_ERROR "Failed to create season" — the symptom in #1238.
--
-- This migration adds the missing column. Existing rows (zero in production
-- at fix time) get NULL; new rows must supply a non-empty trimmed name per
-- the existing validator, which is enforced at API boundary (not DB CHECK)
-- to keep the constraint shape consistent with the rest of the schema.
--
-- Idempotent via `IF NOT EXISTS` so reruns are safe.

alter table public.activity_plan_seasons
  add column if not exists name text;

comment on column public.activity_plan_seasons.name is
  'Operator-facing label for the season window (e.g. 旺季). Required by API/UI as of GH-1238.';
