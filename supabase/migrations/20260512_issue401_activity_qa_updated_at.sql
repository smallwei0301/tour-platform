-- Migration: Add updated_at column to activity_qa (issue #401)
-- Issue #401: PATCH routes write updated_at but the column was missing from the table.
-- Forward migration: idempotent ADD COLUMN IF NOT EXISTS
-- Safety: does NOT modify the already-deployed 20260511_issue352a_activity_qa migration.

ALTER TABLE public.activity_qa
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Auto-maintain updated_at on row updates
CREATE OR REPLACE FUNCTION public.set_activity_qa_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_qa_updated_at ON public.activity_qa;
CREATE TRIGGER trg_activity_qa_updated_at
  BEFORE UPDATE ON public.activity_qa
  FOR EACH ROW EXECUTE FUNCTION public.set_activity_qa_updated_at();
