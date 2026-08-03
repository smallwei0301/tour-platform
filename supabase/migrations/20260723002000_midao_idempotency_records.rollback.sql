-- OPERATOR-ONLY ROLLBACK COMPANION for 20260723002000_midao_idempotency_records.sql
-- NEVER auto-run. A separate owner authorization and a new, reviewed recovery
-- migration are required. Dropping historical idempotency data is destructive,
-- so this file deliberately blocks and invents no historical rollback action.

DO $rollback$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'MIDAO_HISTORICAL_ROLLBACK_BLOCKED',
    DETAIL = 'Data-bearing historical table rollback is intentionally not defined; obtain separate owner authorization and prepare a reviewed recovery migration.';
END
$rollback$;