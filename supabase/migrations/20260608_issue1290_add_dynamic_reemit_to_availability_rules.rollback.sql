-- GH-1290 rollback: remove use_dynamic_reemit column from guide_availability_rules
--
-- Safe to run multiple times (DROP COLUMN IF EXISTS).
-- Apply only if the forward migration was applied and needs to be reverted.

ALTER TABLE guide_availability_rules
  DROP COLUMN IF EXISTS use_dynamic_reemit;
