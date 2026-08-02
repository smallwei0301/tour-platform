-- OPERATOR-ONLY ROLLBACK COMPANION for
-- 20260723021000_midao_service_publication_versions.sql
-- NEVER auto-run. A separate owner authorization and a new, reviewed recovery
-- migration are required. service_publication_versions is an append-only,
-- immutable audit of published service snapshots; dropping it is destructive, so
-- this file deliberately blocks and invents no historical rollback action.

DO $rollback$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'MIDAO_HISTORICAL_ROLLBACK_BLOCKED',
    DETAIL = 'Data-bearing immutable publication-version rollback is intentionally not defined; obtain separate owner authorization and prepare a reviewed recovery migration.';
END
$rollback$;
