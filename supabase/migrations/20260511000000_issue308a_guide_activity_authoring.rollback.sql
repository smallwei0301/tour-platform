-- ============================================================
-- ROLLBACK for Issue #322 / #308a
-- Companion to: 20260511000000_issue308a_guide_activity_authoring.sql
-- ============================================================
--
-- Drops:
--   - 6 new columns on activities (AC1)
--   - activity_images table and all its policies (AC2)
--   - activity_plan_tiers table and all its policies (AC2)
--   - guide-scoped policies on activities (AC3/AC4/AC6)
--   - guide-scoped policies on activity_schedules (SCOPE_REVIEW §4)
--   - guide-scoped policies on activity_plans (AC3/AC4)
--
-- Preserves:
--   - Pre-existing "activities: public read published" policy
--   - Pre-existing "activities: service role full access" policy
--   - Pre-existing "activity_schedules: public read" policy
--   - Pre-existing "activity_schedules: service role full access" policy
--   - Pre-existing "activity_plans: public read active plans" policy
--   - Pre-existing "activity_plans: service role full access" policy
-- ============================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Drop new tables (CASCADE drops their policies and indexes automatically)
-- ──────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.activity_plan_tiers;
DROP TABLE IF EXISTS public.activity_images;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Drop guide-scoped policies on activities
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "activities: guide owner read own"   ON public.activities;
DROP POLICY IF EXISTS "activities: guide owner insert own" ON public.activities;
DROP POLICY IF EXISTS "activities: guide owner update own" ON public.activities;
DROP POLICY IF EXISTS "activities: guide owner delete own" ON public.activities;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Drop guide-scoped policies on activity_schedules
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "activity_schedules: guide owner read own"   ON public.activity_schedules;
DROP POLICY IF EXISTS "activity_schedules: guide owner insert own" ON public.activity_schedules;
DROP POLICY IF EXISTS "activity_schedules: guide owner update own" ON public.activity_schedules;
DROP POLICY IF EXISTS "activity_schedules: guide owner delete own" ON public.activity_schedules;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Drop guide-scoped policies on activity_plans
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "activity_plans: guide owner read own"   ON public.activity_plans;
DROP POLICY IF EXISTS "activity_plans: guide owner insert own" ON public.activity_plans;
DROP POLICY IF EXISTS "activity_plans: guide owner update own" ON public.activity_plans;
DROP POLICY IF EXISTS "activity_plans: guide owner delete own" ON public.activity_plans;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Drop 6 new columns from activities (AC1)
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.activities
  DROP COLUMN IF EXISTS dismissal_point,
  DROP COLUMN IF EXISTS dismissal_point_map_url,
  DROP COLUMN IF EXISTS meeting_lat,
  DROP COLUMN IF EXISTS meeting_lng,
  DROP COLUMN IF EXISTS dismissal_lat,
  DROP COLUMN IF EXISTS dismissal_lng;
