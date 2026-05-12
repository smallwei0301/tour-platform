-- Issue #405: ensure-migration so any environment missing issue #305 migration converges
-- Migration: 20260512_issue405_wishlists_ensure
-- Fully idempotent: safe to run even if public.wishlists already exists.
-- Re-asserts full DDL (table + unique constraint + RLS + 4 policies + index + schema cache reload).

BEGIN;

-- ============================================================
-- 1. Create wishlists table (idempotent)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wishlists (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id text        NOT NULL,
  added_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Unique constraint on (user_id, activity_id) — idempotent
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wishlists'::regclass
      AND conname = 'wishlists_user_activity_unique'
  ) THEN
    ALTER TABLE public.wishlists
      ADD CONSTRAINT wishlists_user_activity_unique UNIQUE (user_id, activity_id);
  END IF;
END $$;

-- ============================================================
-- 3. Index (idempotent via IF NOT EXISTS)
-- ============================================================

CREATE INDEX IF NOT EXISTS wishlists_user_id_idx ON public.wishlists (user_id);

-- ============================================================
-- 4. Enable RLS
-- ============================================================

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. RLS Policies — idempotent via DROP IF EXISTS + CREATE
-- ============================================================

-- select_own: user can see their own wishlist rows
DROP POLICY IF EXISTS "wishlists: user select own" ON public.wishlists;
CREATE POLICY "wishlists: user select own"
  ON public.wishlists
  FOR SELECT
  USING (user_id = auth.uid());

-- insert_own: user can only add rows for themselves
DROP POLICY IF EXISTS "wishlists: user insert own" ON public.wishlists;
CREATE POLICY "wishlists: user insert own"
  ON public.wishlists
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- delete_own: user can only delete their own rows
DROP POLICY IF EXISTS "wishlists: user delete own" ON public.wishlists;
CREATE POLICY "wishlists: user delete own"
  ON public.wishlists
  FOR DELETE
  USING (user_id = auth.uid());

-- service_all: service role bypass for server-side operations
DROP POLICY IF EXISTS "wishlists: service role full access" ON public.wishlists;
CREATE POLICY "wishlists: service role full access"
  ON public.wishlists
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 6. Refresh PostgREST schema cache
-- ============================================================

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
