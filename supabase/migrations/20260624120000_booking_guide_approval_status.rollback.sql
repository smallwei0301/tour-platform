-- Rollback for 20260624120000_booking_guide_approval_status.sql
-- 欄位新增前不存在且有預設值，drop 安全。

DROP INDEX IF EXISTS idx_bookings_guide_approval_status;

ALTER TABLE bookings
  DROP COLUMN IF EXISTS guide_approval_status,
  DROP COLUMN IF EXISTS guide_approval_decided_at,
  DROP COLUMN IF EXISTS guide_approval_note;
