-- OPERATOR-ONLY ROLLBACK COMPANION for 20260723000000_midao_backend_mode.sql
-- NEVER auto-run. A separate owner authorization and a new, reviewed recovery
-- migration are required. Historical pre-migration catalog/data state is not
-- recoverable from durable evidence; this file deliberately invents no action.

DO $rollback$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'MIDAO_HISTORICAL_ROLLBACK_BLOCKED',
    DETAIL = 'Historical rollback action is intentionally not defined; obtain separate owner authorization and prepare a reviewed recovery migration.';
END
$rollback$;