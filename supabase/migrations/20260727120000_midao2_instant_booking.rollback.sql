-- Rollback for 20260727120000_midao2_instant_booking.sql
-- 依 migration-apply-ledger-sop.md：執行前先確認備份點；執行後把 ledger record 改回 pending 並註明原因。

DROP TABLE IF EXISTS midao_slot_consumptions;

ALTER TABLE midao_requests DROP COLUMN IF EXISTS kind;

ALTER TABLE midao_requests DROP CONSTRAINT IF EXISTS midao_requests_preferred_period_check;
ALTER TABLE midao_requests ADD CONSTRAINT midao_requests_preferred_period_check
  CHECK (preferred_period IN ('morning','afternoon','evening'));

ALTER TABLE midao_requests DROP CONSTRAINT IF EXISTS midao_requests_status_check;
ALTER TABLE midao_requests ADD CONSTRAINT midao_requests_status_check
  CHECK (status IN ('new','pending_reply','replied','closed_won','closed_done'));
