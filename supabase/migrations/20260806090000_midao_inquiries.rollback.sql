-- OPERATOR-ONLY ROLLBACK COMPANION for
-- 20260806090000_midao_inquiries.sql
-- NEVER auto-run. Requires a separate owner authorization. Before execution,
-- deploy an application version that no longer reads or writes
-- public.guide_inquiries, then in one transaction run:
--   SET LOCAL midao.rollback_owner_authorized = 'issue-1759';
-- 這支 rollback 會刪除 public.guide_inquiries 整張表。它只在該 migration 尚未於
-- production 累積詢問資料時才安全（#1759 Task 32 為套用前的 source-side preflight）。
-- 若表內已有資料，請先另案備份並取得 owner 授權。
--
-- 若同時回退本檔與 20260806091000_midao_booking_intake_pricing_and_confirmation.sql，
-- 順序必須是「先 091000 後 090000」（先移除指向本表的 FK/欄位，再刪表）。

BEGIN;

DO $rollback$
BEGIN
  IF current_setting('midao.rollback_owner_authorized', true) IS DISTINCT FROM 'issue-1759' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MIDAO_ROLLBACK_OWNER_AUTHORIZATION_REQUIRED';
  END IF;
END
$rollback$;

DROP POLICY IF EXISTS midao_guide_inquiries_traveler_select ON public.guide_inquiries;

DROP INDEX IF EXISTS public.midao_guide_inquiries_activity_status_updated_idx;
DROP INDEX IF EXISTS public.midao_guide_inquiries_guide_status_updated_idx;
DROP INDEX IF EXISTS public.midao_guide_inquiries_traveler_created_idx;

DROP TABLE IF EXISTS public.guide_inquiries;

COMMIT;
