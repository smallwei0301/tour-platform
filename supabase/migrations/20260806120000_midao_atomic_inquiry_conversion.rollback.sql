-- OPERATOR-ONLY ROLLBACK COMPANION for 20260806120000_midao_atomic_inquiry_conversion.sql
--
-- 邊界（Canary §7）：本檔只能 revoke execute / drop RPC / 還原 ACL。
-- 嚴禁刪除任何 booking / order / pricing snapshot / intake / token / status log / outbox 資料。
-- public.midao_booking_capacity_locks 為互斥用途、不含業務資料，但 DROP 會使既有鎖點消失，
-- 因此本檔預設「保留該表」，只 drop 三支函式。若 owner 日後要移除該表，另開授權 migration。
--
-- 本檔可安全執行（只移除函式，無資料破壞性）；業務「資料回滾」需另案 owner 授權，
-- 不在本檔範圍內，也不得在本檔內加入任何 DELETE／TRUNCATE／DROP TABLE。

REVOKE ALL ON FUNCTION public.midao_expire_stale_confirmation_atomic(uuid, timestamptz)
  FROM service_role;
REVOKE ALL ON FUNCTION public.midao_accept_traveler_confirmation(uuid, text, text, text)
  FROM service_role;
REVOKE ALL ON FUNCTION public.midao_convert_inquiry_to_booking(uuid, text, text, uuid, uuid, timestamptz, timestamptz, integer, integer, text, integer, text, text, text, text, text, text)
  FROM service_role;

DROP FUNCTION IF EXISTS public.midao_expire_stale_confirmation_atomic(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.midao_accept_traveler_confirmation(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.midao_convert_inquiry_to_booking(uuid, text, text, uuid, uuid, timestamptz, timestamptz, integer, integer, text, integer, text, text, text, text, text, text);
