BEGIN;

DROP INDEX IF EXISTS public.idx_activity_plans_review_state;

ALTER TABLE public.activity_plans
  DROP CONSTRAINT IF EXISTS activity_plans_review_state_check;

ALTER TABLE public.activity_plans
  DROP COLUMN IF EXISTS review_state,
  DROP COLUMN IF EXISTS pending_changes,
  DROP COLUMN IF EXISTS pending_submitted_by_guide_id,
  DROP COLUMN IF EXISTS pending_submitted_at,
  DROP COLUMN IF EXISTS pending_base_updated_at,
  DROP COLUMN IF EXISTS review_admin_note,
  DROP COLUMN IF EXISTS pending_new_plan;

COMMIT;
