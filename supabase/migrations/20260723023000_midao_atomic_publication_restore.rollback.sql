-- OPERATOR-ONLY ROLLBACK COMPANION for
-- 20260723023000_midao_atomic_publication_restore.sql
-- NEVER auto-run. Requires separate owner authorization. Deploy an application
-- version that no longer calls midao_restore_service_publication, then in one
-- transaction run:
--   SET LOCAL midao.rollback_owner_authorized = 'issue-1758';
-- This removes only the new RPC. It never deletes canonical service data,
-- idempotency records, or immutable service_publication_versions history.

BEGIN;

DO $rollback$
BEGIN
  IF current_setting('midao.rollback_owner_authorized', true) IS DISTINCT FROM 'issue-1758' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MIDAO_ROLLBACK_OWNER_AUTHORIZATION_REQUIRED';
  END IF;
END
$rollback$;

DROP FUNCTION IF EXISTS public.midao_restore_service_publication(uuid, integer, text, text, text, text);

COMMIT;
