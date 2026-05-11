-- ============================================================
-- Issue #322 / #308a — DB / RLS foundation for guide-owned
-- activity authoring (Phase 11 CMS)
-- ============================================================
--
-- SUMMARY OF CHANGES
-- ------------------
-- AC1: ADD 6 NULLable columns to activities
--        dismissal_point            text
--        dismissal_point_map_url    text
--        meeting_lat                numeric(10,7)
--        meeting_lng                numeric(10,7)
--        dismissal_lat              numeric(10,7)
--        dismissal_lng              numeric(10,7)
--
-- AC2: CREATE TABLE activity_images (kind CHECK, sort_order, ON DELETE CASCADE)
--      CREATE TABLE activity_plan_tiers (tier CHECK, UNIQUE per plan, ON DELETE CASCADE)
--
-- AC3/AC4/AC6: Guide-scoped SELECT/INSERT/UPDATE/DELETE RLS policies on:
--   activities, activity_schedules, activity_plans
--
-- IMPORTANT — PERMISSIVE OR SEMANTICS
-- Postgres RLS is permissive-OR: a row passes if ANY policy's USING returns
-- true. The existing "activities: public read published" policy (status='published')
-- remains intact. The new guide-scoped SELECT policy ADDS access for guides
-- to see their own rows (any status). These two policies combine with OR —
-- published rows are visible to all, and guide-owned rows (any status) are
-- visible to their guide. Do NOT drop the existing public-read policy when
-- cleaning up; it serves a different purpose.
--
-- guide_profiles.user_id IS NULLABLE
-- All RLS subqueries guard: WHERE user_id = auth.uid() AND user_id IS NOT NULL
-- This prevents NULL = auth.uid() from accidentally granting access.
-- ============================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- AC1: Schema extension — 6 new NULLable columns on activities
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS dismissal_point         text,
  ADD COLUMN IF NOT EXISTS dismissal_point_map_url text,
  ADD COLUMN IF NOT EXISTS meeting_lat             numeric(10,7),
  ADD COLUMN IF NOT EXISTS meeting_lng             numeric(10,7),
  ADD COLUMN IF NOT EXISTS dismissal_lat           numeric(10,7),
  ADD COLUMN IF NOT EXISTS dismissal_lng           numeric(10,7);

COMMENT ON COLUMN public.activities.dismissal_point         IS 'Text description of where participants are dropped off after the activity';
COMMENT ON COLUMN public.activities.dismissal_point_map_url IS 'Map URL for the dismissal/drop-off point';
COMMENT ON COLUMN public.activities.meeting_lat             IS 'Latitude of the meeting point (WGS-84, up to 7 decimal places)';
COMMENT ON COLUMN public.activities.meeting_lng             IS 'Longitude of the meeting point (WGS-84, up to 7 decimal places)';
COMMENT ON COLUMN public.activities.dismissal_lat           IS 'Latitude of the dismissal point (WGS-84, up to 7 decimal places)';
COMMENT ON COLUMN public.activities.dismissal_lng           IS 'Longitude of the dismissal point (WGS-84, up to 7 decimal places)';

-- ──────────────────────────────────────────────────────────────────────────────
-- AC2: New tables — activity_images + activity_plan_tiers
-- ──────────────────────────────────────────────────────────────────────────────

-- activity_images: structured image storage for activities.
-- NOTE: The existing activities.image_urls jsonb column continues to be the
-- read source for GET /api/activities/[slug] (dual-existence, AC5).
-- This table is write-ready but NOT yet consumed by any API route.
CREATE TABLE IF NOT EXISTS public.activity_images (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid        NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  url         text        NOT NULL,
  kind        text        NOT NULL DEFAULT 'gallery'
                CHECK (kind IN ('cover', 'gallery')),
  alt_text    text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_images_activity_id_sort
  ON public.activity_images(activity_id, sort_order);

-- RLS for activity_images (new table: must ENABLE first)
ALTER TABLE public.activity_images ENABLE ROW LEVEL SECURITY;

-- activity_plan_tiers: per-plan pricing tiers (adult/child/infant).
-- Mirrors activity_plans relationships; used by guide CMS to set per-tier prices.
CREATE TABLE IF NOT EXISTS public.activity_plan_tiers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid        NOT NULL REFERENCES public.activity_plans(id) ON DELETE CASCADE,
  tier        text        NOT NULL
                CHECK (tier IN ('adult', 'child', 'infant')),
  price_twd   integer     NOT NULL DEFAULT 0 CHECK (price_twd >= 0),
  label       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_activity_plan_tiers_plan_id
  ON public.activity_plan_tiers(plan_id);

-- RLS for activity_plan_tiers (new table: must ENABLE first)
ALTER TABLE public.activity_plan_tiers ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────────
-- AC3/AC4/AC6: Guide-scoped RLS policies
--
-- Pattern for USING clause (guide owns the activity):
--   EXISTS (
--     SELECT 1 FROM public.guide_profiles gp
--     JOIN public.activities a ON a.guide_id = gp.id
--     WHERE gp.user_id = auth.uid()
--       AND gp.user_id IS NOT NULL
--       AND a.id = <table>.activity_id   -- or activities.id
--   )
--
-- Pattern for guide_profiles self-access:
--   EXISTS (
--     SELECT 1 FROM public.guide_profiles gp
--     WHERE gp.user_id = auth.uid()
--       AND gp.user_id IS NOT NULL
--       AND gp.id = <table>.guide_id
--   )
-- ──────────────────────────────────────────────────────────────────────────────

-- ── activities: guide-scoped SELECT (AC3, additive with public-read) ──────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activities'
      AND policyname = 'activities: guide owner read own'
  ) THEN
    CREATE POLICY "activities: guide owner read own"
      ON public.activities
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND gp.id = activities.guide_id
        )
      );
  END IF;
END $$;

-- ── activities: guide-scoped INSERT (AC4 — only own rows) ────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activities'
      AND policyname = 'activities: guide owner insert own'
  ) THEN
    CREATE POLICY "activities: guide owner insert own"
      ON public.activities
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND gp.id = activities.guide_id
        )
      );
  END IF;
END $$;

-- ── activities: guide-scoped UPDATE (AC4 — only own rows) ────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activities'
      AND policyname = 'activities: guide owner update own'
  ) THEN
    CREATE POLICY "activities: guide owner update own"
      ON public.activities
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND gp.id = activities.guide_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND gp.id = activities.guide_id
        )
      );
  END IF;
END $$;

-- ── activities: guide-scoped DELETE (AC4 — only own rows) ────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activities'
      AND policyname = 'activities: guide owner delete own'
  ) THEN
    CREATE POLICY "activities: guide owner delete own"
      ON public.activities
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND gp.id = activities.guide_id
        )
      );
  END IF;
END $$;

-- ── activity_schedules: guide-scoped policies (SCOPE_REVIEW §4) ──────────────
-- activity_schedules already has RLS enabled — only CREATE POLICY, no ENABLE.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_schedules'
      AND policyname = 'activity_schedules: guide owner read own'
  ) THEN
    CREATE POLICY "activity_schedules: guide owner read own"
      ON public.activity_schedules
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_schedules.activity_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_schedules'
      AND policyname = 'activity_schedules: guide owner insert own'
  ) THEN
    CREATE POLICY "activity_schedules: guide owner insert own"
      ON public.activity_schedules
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_schedules.activity_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_schedules'
      AND policyname = 'activity_schedules: guide owner update own'
  ) THEN
    CREATE POLICY "activity_schedules: guide owner update own"
      ON public.activity_schedules
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_schedules.activity_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_schedules.activity_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_schedules'
      AND policyname = 'activity_schedules: guide owner delete own'
  ) THEN
    CREATE POLICY "activity_schedules: guide owner delete own"
      ON public.activity_schedules
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_schedules.activity_id
        )
      );
  END IF;
END $$;

-- ── activity_plans: guide-scoped policies ────────────────────────────────────
-- activity_plans already has RLS enabled. Must NOT collide with:
--   "activity_plans: public read active plans"
--   "activity_plans: service role full access"

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plans'
      AND policyname = 'activity_plans: guide owner read own'
  ) THEN
    CREATE POLICY "activity_plans: guide owner read own"
      ON public.activity_plans
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_plans.activity_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plans'
      AND policyname = 'activity_plans: guide owner insert own'
  ) THEN
    CREATE POLICY "activity_plans: guide owner insert own"
      ON public.activity_plans
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_plans.activity_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plans'
      AND policyname = 'activity_plans: guide owner update own'
  ) THEN
    CREATE POLICY "activity_plans: guide owner update own"
      ON public.activity_plans
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_plans.activity_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_plans.activity_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plans'
      AND policyname = 'activity_plans: guide owner delete own'
  ) THEN
    CREATE POLICY "activity_plans: guide owner delete own"
      ON public.activity_plans
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_plans.activity_id
        )
      );
  END IF;
END $$;

-- ── activity_images: guide-scoped policies (new table) ───────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_images'
      AND policyname = 'activity_images: service role full access'
  ) THEN
    CREATE POLICY "activity_images: service role full access"
      ON public.activity_images
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_images'
      AND policyname = 'activity_images: guide owner read own'
  ) THEN
    CREATE POLICY "activity_images: guide owner read own"
      ON public.activity_images
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_images.activity_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_images'
      AND policyname = 'activity_images: guide owner insert own'
  ) THEN
    CREATE POLICY "activity_images: guide owner insert own"
      ON public.activity_images
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_images.activity_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_images'
      AND policyname = 'activity_images: guide owner update own'
  ) THEN
    CREATE POLICY "activity_images: guide owner update own"
      ON public.activity_images
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_images.activity_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_images.activity_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_images'
      AND policyname = 'activity_images: guide owner delete own'
  ) THEN
    CREATE POLICY "activity_images: guide owner delete own"
      ON public.activity_images
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND a.id = activity_images.activity_id
        )
      );
  END IF;
END $$;

-- ── activity_plan_tiers: guide-scoped policies (new table) ───────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plan_tiers'
      AND policyname = 'activity_plan_tiers: service role full access'
  ) THEN
    CREATE POLICY "activity_plan_tiers: service role full access"
      ON public.activity_plan_tiers
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plan_tiers'
      AND policyname = 'activity_plan_tiers: guide owner read own'
  ) THEN
    CREATE POLICY "activity_plan_tiers: guide owner read own"
      ON public.activity_plan_tiers
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          JOIN public.activity_plans ap ON ap.activity_id = a.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND ap.id = activity_plan_tiers.plan_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plan_tiers'
      AND policyname = 'activity_plan_tiers: guide owner insert own'
  ) THEN
    CREATE POLICY "activity_plan_tiers: guide owner insert own"
      ON public.activity_plan_tiers
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          JOIN public.activity_plans ap ON ap.activity_id = a.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND ap.id = activity_plan_tiers.plan_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plan_tiers'
      AND policyname = 'activity_plan_tiers: guide owner update own'
  ) THEN
    CREATE POLICY "activity_plan_tiers: guide owner update own"
      ON public.activity_plan_tiers
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          JOIN public.activity_plans ap ON ap.activity_id = a.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND ap.id = activity_plan_tiers.plan_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          JOIN public.activity_plans ap ON ap.activity_id = a.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND ap.id = activity_plan_tiers.plan_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_plan_tiers'
      AND policyname = 'activity_plan_tiers: guide owner delete own'
  ) THEN
    CREATE POLICY "activity_plan_tiers: guide owner delete own"
      ON public.activity_plan_tiers
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.guide_profiles gp
          JOIN public.activities a ON a.guide_id = gp.id
          JOIN public.activity_plans ap ON ap.activity_id = a.id
          WHERE gp.user_id = auth.uid()
            AND gp.user_id IS NOT NULL
            AND ap.id = activity_plan_tiers.plan_id
        )
      );
  END IF;
END $$;
