BEGIN;

DROP INDEX IF EXISTS public.idx_activities_review_state;

ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_review_state_check;

ALTER TABLE public.activities
  DROP COLUMN IF EXISTS review_state,
  DROP COLUMN IF EXISTS pending_changes,
  DROP COLUMN IF EXISTS pending_submitted_by_guide_id,
  DROP COLUMN IF EXISTS pending_submitted_at,
  DROP COLUMN IF EXISTS pending_base_updated_at,
  DROP COLUMN IF EXISTS review_admin_note;

COMMIT;
