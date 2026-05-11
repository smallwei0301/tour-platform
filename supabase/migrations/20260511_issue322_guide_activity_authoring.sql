-- Migration: 20260511_issue322_guide_activity_authoring
-- Issue #322: DB / RLS foundation for guide-owned activity authoring
-- Parent: #308 (Phase 11, CMS)
-- Risk: HIGH — db-migration + supabase-rls + auth
--
-- Adds:
--   1) 6 nullable columns to activities (dismissal/meeting lat/lng + dismissal map URL)
--   2) activity_images table (normalized gallery metadata with sort_order)
--   3) activity_plan_tiers table (per-tier pricing: adult/child/infant)
--   4) Guide-scoped RLS policies for activities, activity_images,
--      activity_plans, activity_plan_tiers, activity_schedules
--
-- Safety: idempotent DDL (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
--         CREATE INDEX IF NOT EXISTS); RLS policies use DO $$ to guard duplicates.
-- Rollback: 20260511_issue322_guide_activity_authoring.rollback.sql

BEGIN;

-- ============================================================
-- 1. Add nullable columns to activities (AC1)
-- ============================================================

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS dismissal_point         text,
  ADD COLUMN IF NOT EXISTS dismissal_point_map_url text,
  ADD COLUMN IF NOT EXISTS meeting_lat             numeric(10,7),
  ADD COLUMN IF NOT EXISTS meeting_lng             numeric(10,7),
  ADD COLUMN IF NOT EXISTS dismissal_lat           numeric(10,7),
  ADD COLUMN IF NOT EXISTS dismissal_lng           numeric(10,7);

-- ============================================================
-- 2. Create activity_images table (AC2)
-- Normalized gallery rows — separate from image_urls jsonb (kept for backward compat)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_images (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid         NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  url         text         NOT NULL,
  alt         text,
  kind        text         NOT NULL CHECK (kind IN ('cover', 'gallery')),
  sort_order  integer      NOT NULL DEFAULT 0,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_images_activity_id_sort_order
  ON public.activity_images(activity_id, sort_order);

-- ============================================================
-- 3. Create activity_plan_tiers table (AC3)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_plan_tiers (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      uuid          NOT NULL REFERENCES public.activity_plans(id) ON DELETE CASCADE,
  tier         text          NOT NULL CHECK (tier IN ('adult', 'child', 'infant')),
  price_twd    integer       NOT NULL CHECK (price_twd >= 0),
  multiplier   numeric(4,2),
  created_at   timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (plan_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_activity_plan_tiers_plan_id
  ON public.activity_plan_tiers(plan_id);

-- ============================================================
-- 4. Enable RLS on new tables
-- ============================================================

ALTER TABLE public.activity_images    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_plan_tiers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. RLS policies — Guide-scoped access
--
-- Pattern: (SELECT id FROM guide_profiles WHERE user_id = auth.uid())
-- This matches guide JWT token's user_id → guide_profiles.id → guide_id on activities
--
-- Idempotent: wrapped in DO $$ with pg_policies check to guard against re-run.
-- Service-role bypass is already the default in Supabase (no RLS for service_role).
-- ============================================================

-- ---- 5a. activities: guide SELECT (AC4) ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activities'
      AND policyname = 'activities: guide select own'
  ) THEN
    CREATE POLICY "activities: guide select own"
      ON public.activities
      FOR SELECT
      USING (
        guide_id = (
          SELECT id FROM public.guide_profiles
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ---- 5b. activities: guide INSERT (AC4/AC5) ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activities'
      AND policyname = 'activities: guide insert own'
  ) THEN
    CREATE POLICY "activities: guide insert own"
      ON public.activities
      FOR INSERT
      WITH CHECK (
        guide_id = (
          SELECT id FROM public.guide_profiles
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ---- 5c. activities: guide UPDATE (AC5 — update on non-owned rows = 0 rows) ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activities'
      AND policyname = 'activities: guide update own'
  ) THEN
    CREATE POLICY "activities: guide update own"
      ON public.activities
      FOR UPDATE
      USING (
        guide_id = (
          SELECT id FROM public.guide_profiles
          WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        guide_id = (
          SELECT id FROM public.guide_profiles
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ---- 5d. activity_images: service role full access ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_images'
      AND policyname = 'activity_images: service role full access'
  ) THEN
    CREATE POLICY "activity_images: service role full access"
      ON public.activity_images
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ---- 5e. activity_images: guide CRUD (AC4) — via activity ownership ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_images'
      AND policyname = 'activity_images: guide manage own'
  ) THEN
    CREATE POLICY "activity_images: guide manage own"
      ON public.activity_images
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.activities a
          WHERE a.id = activity_images.activity_id
            AND a.guide_id = (
              SELECT id FROM public.guide_profiles
              WHERE user_id = auth.uid()
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.activities a
          WHERE a.id = activity_images.activity_id
            AND a.guide_id = (
              SELECT id FROM public.guide_profiles
              WHERE user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;

-- ---- 5f. activity_images: public read (gallery visible to all) ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_images'
      AND policyname = 'activity_images: public read'
  ) THEN
    CREATE POLICY "activity_images: public read"
      ON public.activity_images
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- ---- 5g. activity_plans: guide CRUD (AC4) — via activity ownership ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plans'
      AND policyname = 'activity_plans: guide manage own'
  ) THEN
    -- Enable RLS on activity_plans if not already enabled
    ALTER TABLE public.activity_plans ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "activity_plans: guide manage own"
      ON public.activity_plans
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.activities a
          WHERE a.id = activity_plans.activity_id
            AND a.guide_id = (
              SELECT id FROM public.guide_profiles
              WHERE user_id = auth.uid()
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.activities a
          WHERE a.id = activity_plans.activity_id
            AND a.guide_id = (
              SELECT id FROM public.guide_profiles
              WHERE user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;

-- ---- 5h. activity_plan_tiers: service role full access ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plan_tiers'
      AND policyname = 'activity_plan_tiers: service role full access'
  ) THEN
    CREATE POLICY "activity_plan_tiers: service role full access"
      ON public.activity_plan_tiers
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ---- 5i. activity_plan_tiers: guide CRUD (AC4) — via plan → activity ownership ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plan_tiers'
      AND policyname = 'activity_plan_tiers: guide manage own'
  ) THEN
    CREATE POLICY "activity_plan_tiers: guide manage own"
      ON public.activity_plan_tiers
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.activity_plans ap
          JOIN public.activities a ON a.id = ap.activity_id
          WHERE ap.id = activity_plan_tiers.plan_id
            AND a.guide_id = (
              SELECT id FROM public.guide_profiles
              WHERE user_id = auth.uid()
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.activity_plans ap
          JOIN public.activities a ON a.id = ap.activity_id
          WHERE ap.id = activity_plan_tiers.plan_id
            AND a.guide_id = (
              SELECT id FROM public.guide_profiles
              WHERE user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;

-- ---- 5j. activity_schedules: guide CRUD (if table exists) ----
-- activity_schedules was created in 002_activities_admin.sql with RLS enabled.
-- We add a guide-scoped policy via activity ownership.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'activity_schedules'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_schedules'
      AND policyname = 'activity_schedules: guide manage own'
  ) THEN
    CREATE POLICY "activity_schedules: guide manage own"
      ON public.activity_schedules
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.activities a
          WHERE a.id = activity_schedules.activity_id
            AND a.guide_id = (
              SELECT id FROM public.guide_profiles
              WHERE user_id = auth.uid()
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.activities a
          WHERE a.id = activity_schedules.activity_id
            AND a.guide_id = (
              SELECT id FROM public.guide_profiles
              WHERE user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;

COMMIT;
