-- OPERATOR-ONLY, FORWARD-SAFE ROLLBACK COMPANION for #1760 atomic day availability.
-- Persisted day tombstones and replacement ranges are deliberately retained: deleting them
-- could reopen a closed day through an older recurring global rule. This only disables the
-- dormant RPC entry point; a later authorized forward migration must replace the contract.

REVOKE ALL ON FUNCTION public.midao_replace_global_day_availability(
  uuid, date, text, bigint, jsonb, text, text
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.guide_availability_day_revisions IS
  'Issue #1760 rollback is fail-closed: retained to prevent silent reversion to non-CAS day availability behavior.';
