-- Source-only companion. This rollback requires an explicit owner session and
-- deliberately does not delete orders, points, idempotency history or payments.
DO $rollback$
BEGIN
  IF pg_catalog.current_setting('midao.rollback_owner_authorized', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MIDAO_ROLLBACK_OWNER_AUTHORIZATION_REQUIRED';
  END IF;
END;
$rollback$;

REVOKE ALL ON FUNCTION public.fn_create_booking_draft_with_addons_points_idempotent(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.fn_create_booking_draft_with_addons_points_idempotent(
  uuid, uuid, timestamptz, timestamptz, text, integer, text, text, text, text, text, uuid, jsonb, text, timestamptz, jsonb, integer, text, text, text, text
);
