-- Issue #341: Rollback — drop tour_reminder_log table
-- Phase 13 — Tour Platform

BEGIN;

DROP TABLE IF EXISTS tour_reminder_log;

COMMIT;
