-- Issue #1760 Package 5 / slice 1: dormant availability scope and revision contract.
-- No route or resolver consumes these fields in this migration.

ALTER TABLE public.guide_availability_rules
  ADD COLUMN IF NOT EXISTS scope_type text;

UPDATE public.guide_availability_rules
   SET scope_type = CASE
     WHEN activity_plan_id IS NULL THEN 'global'
     ELSE 'plan'
   END
 WHERE scope_type IS NULL
    OR scope_type IS DISTINCT FROM CASE
      WHEN activity_plan_id IS NULL THEN 'global'
      ELSE 'plan'
    END;

ALTER TABLE public.guide_availability_rules
  ALTER COLUMN scope_type SET NOT NULL;

DO $issue1760_scope_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'guide_availability_rules_scope_type_check'
       AND conrelid = 'public.guide_availability_rules'::pg_catalog.regclass
  ) THEN
    ALTER TABLE public.guide_availability_rules
      ADD CONSTRAINT guide_availability_rules_scope_type_check
      CHECK (
        (scope_type = 'global' AND activity_plan_id IS NULL)
        OR (scope_type = 'plan' AND activity_plan_id IS NOT NULL)
      );
  END IF;
END;
$issue1760_scope_constraints$;

ALTER TABLE public.guide_availability_rules
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;

DO $issue1760_revision_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'guide_availability_rules_revision_positive_check'
       AND conrelid = 'public.guide_availability_rules'::pg_catalog.regclass
  ) THEN
    ALTER TABLE public.guide_availability_rules
      ADD CONSTRAINT guide_availability_rules_revision_positive_check
      CHECK (revision > 0);
  END IF;
END;
$issue1760_revision_constraint$;

CREATE OR REPLACE FUNCTION public.guide_availability_rules_scope_revision_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $issue1760_scope_trigger$
BEGIN
  NEW.scope_type := CASE
    WHEN NEW.activity_plan_id IS NULL THEN 'global'
    ELSE 'plan'
  END;

  IF TG_OP = 'INSERT' THEN
    NEW.revision := COALESCE(NEW.revision, 1);
  ELSIF ROW(
    NEW.activity_plan_id,
    NEW.weekday,
    NEW.start_time_local,
    NEW.end_time_local,
    NEW.timezone,
    NEW.slot_interval_minutes,
    NEW.buffer_before_minutes,
    NEW.buffer_after_minutes,
    NEW.effective_from,
    NEW.effective_to,
    NEW.is_active
  ) IS DISTINCT FROM ROW(
    OLD.activity_plan_id,
    OLD.weekday,
    OLD.start_time_local,
    OLD.end_time_local,
    OLD.timezone,
    OLD.slot_interval_minutes,
    OLD.buffer_before_minutes,
    OLD.buffer_after_minutes,
    OLD.effective_from,
    OLD.effective_to,
    OLD.is_active
  ) THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;

  RETURN NEW;
END;
$issue1760_scope_trigger$;

DROP TRIGGER IF EXISTS guide_availability_rules_scope_revision_trigger
  ON public.guide_availability_rules;
CREATE TRIGGER guide_availability_rules_scope_revision_trigger
BEFORE INSERT OR UPDATE ON public.guide_availability_rules
FOR EACH ROW
EXECUTE FUNCTION public.guide_availability_rules_scope_revision_trigger();

ALTER TABLE public.activity_plans
  ADD COLUMN IF NOT EXISTS availability_policy text;

UPDATE public.activity_plans
   SET availability_policy = 'inherit'
 WHERE availability_policy IS NULL;

ALTER TABLE public.activity_plans
  ALTER COLUMN availability_policy SET DEFAULT 'inherit',
  ALTER COLUMN availability_policy SET NOT NULL;

DO $issue1760_policy_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'activity_plans_availability_policy_check'
       AND conrelid = 'public.activity_plans'::pg_catalog.regclass
  ) THEN
    ALTER TABLE public.activity_plans
      ADD CONSTRAINT activity_plans_availability_policy_check
      CHECK (availability_policy IN ('inherit', 'restrict', 'closed'));
  END IF;
END;
$issue1760_policy_constraint$;

CREATE INDEX IF NOT EXISTS idx_guide_availability_rules_active_global_lookup
  ON public.guide_availability_rules (guide_id, effective_from, effective_to, weekday)
  WHERE is_active AND scope_type = 'global';

COMMENT ON COLUMN public.guide_availability_rules.scope_type IS
  'Issue #1760 derived from activity_plan_id; global iff NULL, plan iff non-NULL.';
COMMENT ON COLUMN public.guide_availability_rules.revision IS
  'Single-rule material availability revision; not a day replacement CAS token.';
COMMENT ON COLUMN public.activity_plans.availability_policy IS
  'Dormant #1760 policy contract: inherit, restrict, or closed; scheduled consumers remain unchanged.';
