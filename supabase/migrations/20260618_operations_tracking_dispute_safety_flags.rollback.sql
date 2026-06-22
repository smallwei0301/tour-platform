-- Rollback for 20260618_operations_tracking_dispute_safety_flags.sql
ALTER TABLE operations_tracking
  DROP COLUMN IF EXISTS is_disputed,
  DROP COLUMN IF EXISTS is_safety_case;
