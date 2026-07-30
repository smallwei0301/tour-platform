-- OPERATOR-ONLY ROLLBACK COMPANION for 20260723003500_midao_service_role_acl_hardening.sql
-- NEVER auto-run. A separate owner authorization and a new, reviewed recovery
-- migration are required. Reconstructing prior grants would risk reopening an
-- unknown access boundary, so this file deliberately invents no rollback action.

DO $rollback$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'MIDAO_HISTORICAL_ROLLBACK_BLOCKED',
    DETAIL = 'Historical ACL rollback is intentionally not defined; obtain separate owner authorization and prepare a reviewed recovery migration.';
END
$rollback$;