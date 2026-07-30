-- OPERATOR-ONLY ROLLBACK COMPANION for 20260723010000_midao_atomic_booking_approval.sql
-- NEVER auto-run. Requires a separate owner authorization and reverse-safe
-- order: rollback 20260723011000 first. Before execution deploy an application
-- version that does not call the 3-argument function, then in one transaction
-- run: SET LOCAL midao.rollback_owner_authorized = 'issue-1756';
-- This rollback removes function code only; it never deletes business data.

BEGIN;

DO $rollback$
BEGIN
  IF current_setting('midao.rollback_owner_authorized', true) IS DISTINCT FROM 'issue-1756' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MIDAO_ROLLBACK_OWNER_AUTHORIZATION_REQUIRED';
  END IF;
  IF to_regprocedure('public.midao_decide_booking_request(uuid,text,text,uuid,text,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MIDAO_ROLLBACK_ORDER_BLOCKED',
      DETAIL = 'Rollback 20260723011000_midao_atomic_booking_decision_command.sql first.';
  END IF;
END
$rollback$;

DROP FUNCTION IF EXISTS public.midao_decide_booking_request(uuid, text, text);

COMMIT;