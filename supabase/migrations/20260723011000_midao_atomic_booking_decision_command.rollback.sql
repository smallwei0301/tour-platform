-- OPERATOR-ONLY ROLLBACK COMPANION for 20260723011000_midao_atomic_booking_decision_command.sql
-- NEVER auto-run. Requires a separate owner authorization. Before execution,
-- deploy an application version that uses the preceding 3-argument function,
-- then in one transaction run: SET LOCAL midao.rollback_owner_authorized = 'issue-1756';
-- This restores only the preceding service_role execute grant and removes the
-- newer function code; it never deletes business data or widens public access.

BEGIN;

DO $rollback$
BEGIN
  IF current_setting('midao.rollback_owner_authorized', true) IS DISTINCT FROM 'issue-1756' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MIDAO_ROLLBACK_OWNER_AUTHORIZATION_REQUIRED';
  END IF;
  IF to_regprocedure('public.midao_decide_booking_request(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MIDAO_ROLLBACK_PRECONDITION_FAILED',
      DETAIL = 'The preceding 3-argument function is absent; do not reconstruct it here.';
  END IF;
END
$rollback$;

DROP FUNCTION IF EXISTS public.midao_decide_booking_request(uuid, text, text, uuid, text, text, text, text);
GRANT EXECUTE ON FUNCTION public.midao_decide_booking_request(uuid, text, text) TO service_role;

COMMIT;