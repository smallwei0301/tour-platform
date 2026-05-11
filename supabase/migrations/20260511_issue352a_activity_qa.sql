-- Migration: 20260511_issue352a_activity_qa
-- Issue #361 / #352a: activity_qa backend — table + RLS + traveler submit + admin CRUD
-- Risk: HIGH — db-migration, supabase-rls, auth, public-facing
--
-- Creates:
--   1) activity_qa table with id, activity_id, user_id, question, answer, status, created_at
--   2) RLS enabled + 3 policies (idempotent DO $$ guards):
--        - public_read_approved_qa: public SELECT WHERE status='approved'
--        - authenticated_insert_pending_qa: authenticated INSERT WHERE status='pending_moderation' AND auth.uid()=user_id
--        - service_role_all_qa: service role full access
--   3) Index on (activity_id, status) for efficient moderated reads
--
-- Safety: idempotent CREATE TABLE IF NOT EXISTS; RLS policies use DO $$ IF NOT EXISTS guard.
-- Rollback: DROP TABLE IF EXISTS activity_qa CASCADE (included below as comment block)

BEGIN;

-- ============================================================
-- 1. Create activity_qa table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_qa (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id text        NOT NULL,
  user_id     uuid,
  question    text        NOT NULL,
  answer      text,
  status      text        NOT NULL DEFAULT 'pending_moderation'
                CHECK (status IN ('pending_moderation', 'approved', 'rejected')),
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- 2. Enable Row Level Security
-- ============================================================

ALTER TABLE public.activity_qa ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Index for moderated reads
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_activity_qa_activity_id_status
  ON public.activity_qa(activity_id, status);

-- ============================================================
-- 4. RLS policies (idempotent DO $$ guards)
-- ============================================================

DO $$
BEGIN
  -- Policy 1: public can read approved Q&A only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'activity_qa'
      AND policyname = 'public_read_approved_qa'
  ) THEN
    CREATE POLICY "public_read_approved_qa" ON public.activity_qa
      FOR SELECT USING (status = 'approved');
  END IF;

  -- Policy 2: authenticated users can insert their own pending questions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'activity_qa'
      AND policyname = 'authenticated_insert_pending_qa'
  ) THEN
    CREATE POLICY "authenticated_insert_pending_qa" ON public.activity_qa
      FOR INSERT TO authenticated
      WITH CHECK (status = 'pending_moderation' AND auth.uid() = user_id);
  END IF;

  -- Policy 3: service role has full access (admin CRUD via service key)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'activity_qa'
      AND policyname = 'service_role_all_qa'
  ) THEN
    CREATE POLICY "service_role_all_qa" ON public.activity_qa
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- ============================================================
-- Rollback (run manually to undo this migration)
-- ============================================================
-- DROP TABLE IF EXISTS public.activity_qa CASCADE;
