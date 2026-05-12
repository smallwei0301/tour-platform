-- Rollback: Remove updated_at column from activity_qa (issue #401)
DROP TRIGGER IF EXISTS trg_activity_qa_updated_at ON public.activity_qa;
DROP FUNCTION IF EXISTS public.set_activity_qa_updated_at();
ALTER TABLE public.activity_qa DROP COLUMN IF EXISTS updated_at;
