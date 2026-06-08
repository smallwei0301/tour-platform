-- GH-1290: Add use_dynamic_reemit column to guide_availability_rules
--
-- Purpose: Per-rule toggle for dynamic buffer re-emit behaviour.
-- When OFF (DEFAULT FALSE): behaviour == #1289 fixed-grid, buffer-filtered, no re-emit.
-- When ON: after a booking conflict, a new candidate slot is emitted starting at
--          booking_end + rule.buffer_after_minutes, recovering utilisation.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; safe to run multiple times.
-- Does NOT apply to production. Run verify script after manual apply.

ALTER TABLE guide_availability_rules
  ADD COLUMN IF NOT EXISTS use_dynamic_reemit BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN guide_availability_rules.use_dynamic_reemit IS
  'GH-1290: when true, after a booking conflict the slot generator re-emits a '
  'candidate at booking_end + buffer_after_minutes instead of the fixed grid only. '
  'Default FALSE preserves pre-#1290 behaviour.';
