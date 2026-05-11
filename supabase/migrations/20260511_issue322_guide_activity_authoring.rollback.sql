-- Rollback: 20260511_issue322_guide_activity_authoring
-- Issue #322: DB / RLS foundation for guide-owned activity authoring
-- Reverts all changes introduced by the forward migration.

BEGIN;

-- ============================================================
-- 1. Drop guide-scoped RLS policies added to existing tables
-- ============================================================

-- activities policies
DROP POLICY IF EXISTS "activities: guide select own"  ON public.activities;
DROP POLICY IF EXISTS "activities: guide insert own"  ON public.activities;
DROP POLICY IF EXISTS "activities: guide update own"  ON public.activities;

-- activity_plans policy
DROP POLICY IF EXISTS "activity_plans: guide manage own" ON public.activity_plans;

-- activity_schedules policy
DROP POLICY IF EXISTS "activity_schedules: guide manage own" ON public.activity_schedules;

-- ============================================================
-- 2. Drop new tables (CASCADE drops their policies and indexes)
-- ============================================================

DROP TABLE IF EXISTS public.activity_plan_tiers CASCADE;
DROP TABLE IF EXISTS public.activity_images CASCADE;

-- ============================================================
-- 3. Drop new columns added to activities (AC1 rollback)
-- ============================================================

ALTER TABLE public.activities
  DROP COLUMN IF EXISTS dismissal_point,
  DROP COLUMN IF EXISTS dismissal_point_map_url,
  DROP COLUMN IF EXISTS meeting_lat,
  DROP COLUMN IF EXISTS meeting_lng,
  DROP COLUMN IF EXISTS dismissal_lat,
  DROP COLUMN IF EXISTS dismissal_lng;

COMMIT;
