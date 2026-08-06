-- OPERATOR-ONLY ROLLBACK COMPANION for
-- 20260806091000_midao_booking_intake_pricing_and_confirmation.sql
-- NEVER auto-run. Requires a separate owner authorization. Before execution,
-- deploy an application version that no longer reads or writes
-- booking_intake_responses / booking_pricing_snapshots /
-- booking_confirmation_tokens 與 bookings 的三個新欄位，然後在單一交易中執行：
--   SET LOCAL midao.rollback_owner_authorized = 'issue-1759';
-- 這支 rollback 會刪除三張新表與 bookings 的三個附加欄位。它只在該 migration 尚未於
-- production 累積資料時才安全（#1759 Task 32 為套用前的 source-side preflight）。
-- 若已有資料，請先另案備份並取得 owner 授權。
--
-- 若同時回退本檔與 20260806090000_midao_inquiries.sql，
-- 順序必須是「先本檔（091000）後 090000」。

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

DROP INDEX IF EXISTS public.midao_booking_confirmation_tokens_pending_expiry_idx;

DROP TABLE IF EXISTS public.booking_confirmation_tokens;
DROP TABLE IF EXISTS public.booking_pricing_snapshots;
DROP TABLE IF EXISTS public.booking_intake_responses;

DROP INDEX IF EXISTS public.midao_bookings_source_inquiry_idx;

ALTER TABLE public.guide_inquiries
  DROP CONSTRAINT IF EXISTS midao_guide_inquiries_converted_booking_fk;

ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS traveler_confirmation_expires_at;
ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS traveler_confirmation_status;
ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS source_inquiry_id;

COMMIT;
