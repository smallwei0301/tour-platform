-- OPERATOR-ONLY ROLLBACK COMPANION for
-- 20260812150000_issue1812_addon_atomic_materialization.sql
--
-- Never auto-run. Deploy an application version that no longer calls this RPC,
-- take the required backup, and obtain separate owner authorization first.

BEGIN;

DO $rollback$
BEGIN
  IF current_setting('midao.rollback_owner_authorized', true) IS DISTINCT FROM 'issue-1812' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MIDAO_ROLLBACK_OWNER_AUTHORIZATION_REQUIRED';
  END IF;
END
$rollback$;

REVOKE ALL ON FUNCTION public.fn_create_booking_draft_with_addons_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb
) FROM service_role, PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.fn_create_booking_draft_with_addons_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb
);

COMMIT;
