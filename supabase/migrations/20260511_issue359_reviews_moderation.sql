-- Migration: 20260511_issue359_reviews_moderation
-- Issue #359: Reviews backend — moderation columns + RLS tightening
-- Risk: HIGH — db-migration, supabase-rls, auth, public-facing
--
-- Adds:
--   1) status text column with CHECK (pending/approved/rejected), DEFAULT 'pending'
--   2) booking_id uuid column (nullable, no FK for back-compat)
--   3) user_id uuid column (nullable, no FK for back-compat)
--   4) Backfills existing seed reviews: is_verified=true → status='approved'
--   5) Index on (activity_slug, status) for efficient moderated reads
--   6) Tightens RLS: drops old public_read_reviews, creates public_read_approved_reviews
--
-- Safety: idempotent DDL (ADD COLUMN IF NOT EXISTS);
--         RLS policies use DO $$ IF NOT EXISTS guard.
-- Rollback: 20260511_issue359_reviews_moderation.rollback.sql

BEGIN;

-- ============================================================
-- 1. Add moderation fields to activity_reviews
-- ============================================================

ALTER TABLE public.activity_reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS booking_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- ============================================================
-- 2. Backfill: existing verified seed reviews → approved
-- ============================================================

UPDATE public.activity_reviews
SET status = 'approved'
WHERE is_verified IS TRUE;

-- ============================================================
-- 3. Index for moderated reads
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_activity_reviews_slug_status
  ON public.activity_reviews(activity_slug, status);

-- ============================================================
-- 4. Tighten RLS: public can only read approved reviews
-- ============================================================

DO $$
BEGIN
  -- Drop old permissive policy if exists
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'activity_reviews'
      AND policyname = 'public_read_reviews'
  ) THEN
    DROP POLICY "public_read_reviews" ON public.activity_reviews;
  END IF;

  -- Create new filtered policy (idempotent guard)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'activity_reviews'
      AND policyname = 'public_read_approved_reviews'
  ) THEN
    CREATE POLICY "public_read_approved_reviews" ON public.activity_reviews
      FOR SELECT USING (status = 'approved');
  END IF;
END $$;

COMMIT;
