-- Rollback for 20260709103000_rls_grants_preflight_helper_rpcs.sql
-- Remove helper RPCs used by scripts/security/rls-grants-preflight.mjs.

drop function if exists public.rls_grants_preflight_check_grants(text);
drop function if exists public.rls_grants_preflight_check_policies(text);
