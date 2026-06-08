-- GH-1286: Rollback script for canonical_drift_apply (20260608_issue1286)
--
-- Execute ONLY if the canonical apply script caused unexpected issues and after
-- operator verification that no production traffic depends on the newly created tables.
--
-- WARNING: This rollback DROPS tables and removes columns. All data inserted after
-- the apply will be permanently lost. Back up first.

BEGIN;

-- ============================================================
-- Reverse 7: Remove is_year_round from activity_plans
-- ============================================================
ALTER TABLE public.activity_plans DROP COLUMN IF EXISTS is_year_round;

-- ============================================================
-- Reverse 6: Drop review_invitations
-- ============================================================
DROP TABLE IF EXISTS public.review_invitations CASCADE;

-- ============================================================
-- Reverse 5: Drop guide_trip_reports
-- ============================================================
DROP TABLE IF EXISTS public.guide_trip_reports CASCADE;

-- ============================================================
-- Reverse 4: Drop guide_slot_conflict_overrides + booking audit columns
-- ============================================================
DROP INDEX IF EXISTS public.idx_bookings_conflict_override_id;
ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS conflict_override_id,
  DROP COLUMN IF EXISTS conflict_override_snapshot;

DROP TABLE IF EXISTS public.guide_slot_conflict_overrides CASCADE;

-- ============================================================
-- Reverse 3: Drop anon read policy on activity_plan_seasons
-- (policy is dropped automatically when table is dropped; listed for clarity)
-- ============================================================

-- ============================================================
-- Reverse 2: Drop activity_plan_seasons
-- ============================================================
DROP TABLE IF EXISTS public.activity_plan_seasons CASCADE;

-- ============================================================
-- Reverse 1: Revert activity_plans status CHECK constraint to (active, inactive)
-- ============================================================
ALTER TABLE public.activity_plans
  DROP CONSTRAINT IF EXISTS activity_plans_status_check;

ALTER TABLE public.activity_plans
  ADD CONSTRAINT activity_plans_status_check
  CHECK (status IN ('active', 'inactive'));

COMMIT;
