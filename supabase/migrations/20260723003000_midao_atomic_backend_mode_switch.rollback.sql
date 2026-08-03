-- OPERATOR-ONLY ROLLBACK COMPANION for 20260723003000_midao_atomic_backend_mode_switch.sql
-- NEVER auto-run. A separate owner authorization and a new, reviewed recovery
-- migration are required. Historical function/data dependencies cannot be
-- reconstructed safely, so this file deliberately invents no rollback action.

DO $rollback$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'MIDAO_HISTORICAL_ROLLBACK_BLOCKED',
    DETAIL = 'Historical function rollback is intentionally not defined; obtain separate owner authorization and prepare a reviewed recovery migration.';
END
$rollback$;