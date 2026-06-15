-- LINE integration (#302b): allow 'line_push' in tour_reminder_log.channel
-- Tour Platform — per-traveler LINE reminder channel
-- Idempotent: drop + recreate the named CHECK constraint.

BEGIN;

ALTER TABLE tour_reminder_log DROP CONSTRAINT IF EXISTS tour_reminder_log_channel_check;
ALTER TABLE tour_reminder_log
  ADD CONSTRAINT tour_reminder_log_channel_check
  CHECK (channel IN ('email', 'line_notify_admin', 'line_push'));

COMMIT;
