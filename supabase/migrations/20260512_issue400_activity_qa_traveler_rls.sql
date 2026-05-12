-- Migration: 20260512_issue400_activity_qa_traveler_rls
-- Issue #400: fix traveler submit RLS violation on activity_qa insert + return path
-- Risk: HIGH — db-migration, rls, auth contract

BEGIN;

-- Ensure table-level grants are explicit and RLS-constrained
GRANT SELECT ON TABLE public.activity_qa TO anon;
GRANT SELECT ON TABLE public.activity_qa TO authenticated;
GRANT INSERT ON TABLE public.activity_qa TO authenticated;

DO $$
BEGIN
  -- Keep public approved-only read behavior explicit/idempotent
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_qa'
      AND policyname = 'public_read_approved_qa'
  ) THEN
    CREATE POLICY "public_read_approved_qa" ON public.activity_qa
      FOR SELECT
      TO public
      USING (status = 'approved');
  END IF;

  -- GH-400 fix: authenticated traveler can read their own rows (needed by insert().select().single())
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_qa'
      AND policyname = 'authenticated_read_own_qa'
  ) THEN
    CREATE POLICY "authenticated_read_own_qa" ON public.activity_qa
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  -- Ensure authenticated insert policy exists (idempotent safety)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_qa'
      AND policyname = 'authenticated_insert_pending_qa'
  ) THEN
    CREATE POLICY "authenticated_insert_pending_qa" ON public.activity_qa
      FOR INSERT
      TO authenticated
      WITH CHECK (status = 'pending_moderation' AND auth.uid() = user_id);
  END IF;
END $$;

COMMIT;
