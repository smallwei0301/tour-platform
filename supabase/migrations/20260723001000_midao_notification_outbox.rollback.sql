-- OPERATOR-ONLY ROLLBACK COMPANION for 20260723001000_midao_notification_outbox.sql
-- NEVER auto-run. A separate owner authorization and a new, reviewed recovery
-- migration are required. Dropping an historical outbox could destroy data, so
-- this file deliberately blocks and invents no historical rollback action.

DO $rollback$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'MIDAO_HISTORICAL_ROLLBACK_BLOCKED',
    DETAIL = 'Data-bearing historical table rollback is intentionally not defined; obtain separate owner authorization and prepare a reviewed recovery migration.';
END
$rollback$;