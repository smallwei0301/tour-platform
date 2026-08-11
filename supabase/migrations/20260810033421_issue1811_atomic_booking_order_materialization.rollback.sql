-- OPERATOR-ONLY ROLLBACK COMPANION for
-- 20260810033421_issue1811_atomic_booking_order_materialization.sql
--
-- NEVER auto-run. Before execution, deploy an application version that does
-- not call public.fn_create_booking_draft_atomic, take the required backup,
-- and obtain a separate owner authorization. This rollback removes only the
-- #1811 RPC and its execute privileges; it does not modify business rows.

BEGIN;

DO $rollback$
BEGIN
  IF current_setting('midao.rollback_owner_authorized', true) IS DISTINCT FROM 'issue-1811' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MIDAO_ROLLBACK_OWNER_AUTHORIZATION_REQUIRED';
  END IF;

  IF to_regprocedure(
    'public.fn_create_booking_draft_atomic(uuid,uuid,timestamptz,timestamptz,text,integer,text,text,text,text,text,uuid,jsonb,text,timestamptz)'
  ) IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MIDAO_ROLLBACK_PRECONDITION_FAILED',
      DETAIL = 'The #1811 atomic booking-order RPC is absent; stop and re-check migration state.';
  END IF;
END
$rollback$;

REVOKE ALL ON FUNCTION public.fn_create_booking_draft_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz
) FROM service_role, PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.fn_create_booking_draft_atomic(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz
);

COMMIT;
