-- OPERATOR-ONLY ROLLBACK COMPANION for 20260723004000_midao_request_read_projection.sql
-- NEVER auto-run. Requires a separate owner authorization. Before execution,
-- deploy an application version that does not call this function. In one
-- transaction run: SET LOCAL midao.rollback_owner_authorized = 'issue-1756';
-- This rollback removes only code/indexes; it never deletes business data.

BEGIN;

DO $rollback$
BEGIN
  IF current_setting('midao.rollback_owner_authorized', true) IS DISTINCT FROM 'issue-1756' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MIDAO_ROLLBACK_OWNER_AUTHORIZATION_REQUIRED';
  END IF;
END
$rollback$;

DROP FUNCTION IF EXISTS public.midao_list_booking_requests(uuid, text, text, integer, timestamptz, uuid, integer);
DROP INDEX IF EXISTS public.idx_order_messages_order_latest;

COMMIT;