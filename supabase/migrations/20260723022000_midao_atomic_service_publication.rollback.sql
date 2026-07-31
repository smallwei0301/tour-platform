-- OPERATOR-ONLY ROLLBACK COMPANION for
-- 20260723022000_midao_atomic_service_publication.sql
-- NEVER auto-run. Requires a separate owner authorization. Before execution,
-- deploy an application version that no longer calls midao_publish_service_draft,
-- then in one transaction run:
--   SET LOCAL midao.rollback_owner_authorized = 'issue-1758';
-- This only removes the newly added publish command function; it never deletes
-- business data (activities/plans/questions/publication versions/drafts) and
-- never widens public/anon/authenticated access.

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

DROP FUNCTION IF EXISTS public.midao_publish_service_draft(uuid, integer, uuid);

COMMIT;
