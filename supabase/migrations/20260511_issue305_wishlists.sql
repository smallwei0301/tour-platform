-- Migration: 20260511_issue305_wishlists
-- Issue #305: Wishlist (收藏活動) for logged-in users
-- Risk: MEDIUM — new table + RLS policies
--
-- Adds:
--   1) wishlists table (id, user_id, activity_id, added_at)
--   2) UNIQUE(user_id, activity_id) constraint
--   3) RLS policies: users can only see/modify their own rows
--
-- Safety: idempotent DDL (CREATE TABLE IF NOT EXISTS);
--         RLS policies use DO $$ to guard duplicates.
-- Rollback: DROP TABLE wishlists;

BEGIN;

-- ============================================================
-- 1. Create wishlists table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wishlists (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id uuid        NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wishlists_user_activity_unique UNIQUE (user_id, activity_id)
);

CREATE INDEX IF NOT EXISTS wishlists_user_id_idx ON public.wishlists (user_id);
CREATE INDEX IF NOT EXISTS wishlists_activity_id_idx ON public.wishlists (activity_id);

-- ============================================================
-- 2. Enable RLS
-- ============================================================

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS Policies — users can only see/modify their own rows
-- ============================================================

DO $$
BEGIN
  -- SELECT: user can see their own wishlist rows
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wishlists' AND policyname = 'wishlists: user select own'
  ) THEN
    CREATE POLICY "wishlists: user select own"
      ON public.wishlists
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  -- INSERT: user can only add rows for themselves
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wishlists' AND policyname = 'wishlists: user insert own'
  ) THEN
    CREATE POLICY "wishlists: user insert own"
      ON public.wishlists
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  -- DELETE: user can only delete their own rows
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wishlists' AND policyname = 'wishlists: user delete own'
  ) THEN
    CREATE POLICY "wishlists: user delete own"
      ON public.wishlists
      FOR DELETE
      USING (user_id = auth.uid());
  END IF;

  -- Service role full access (for admin / server-side operations)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wishlists' AND policyname = 'wishlists: service role full access'
  ) THEN
    CREATE POLICY "wishlists: service role full access"
      ON public.wishlists
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMIT;
