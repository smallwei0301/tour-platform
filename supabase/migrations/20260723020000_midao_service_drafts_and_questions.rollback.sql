-- OPERATOR-ONLY ROLLBACK COMPANION for
-- 20260723020000_midao_service_drafts_and_questions.sql
-- NEVER auto-run. A separate owner authorization and a new, reviewed recovery
-- migration are required. Dropping guide_service_drafts / activity_intake_questions
-- (and the additive activities.inquiry_enabled column) is destructive and would
-- lose guide draft/questionnaire state, so this file deliberately blocks and
-- invents no historical rollback action.

DO $rollback$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'MIDAO_HISTORICAL_ROLLBACK_BLOCKED',
    DETAIL = 'Data-bearing service-draft/intake-question schema rollback is intentionally not defined; obtain separate owner authorization and prepare a reviewed recovery migration.';
END
$rollback$;
