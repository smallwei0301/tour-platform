-- OPERATOR-ONLY, FORWARD-SAFE ROLLBACK COMPANION for #1760 scope contract.
-- This companion intentionally preserves scope, policy, revision, trigger, and index state.
-- Removing them would silently restore an unchecked, non-revisioned legacy writer.
-- A later authorized forward migration may supersede this contract after data migration.

COMMENT ON FUNCTION public.guide_availability_rules_scope_revision_trigger() IS
  'Issue #1760 rollback is fail-closed: scope/revision enforcement remains active until an authorized forward replacement is deployed.';
COMMENT ON COLUMN public.activity_plans.availability_policy IS
  'Issue #1760 rollback is fail-closed: persisted availability policy remains until an authorized forward replacement is deployed.';
