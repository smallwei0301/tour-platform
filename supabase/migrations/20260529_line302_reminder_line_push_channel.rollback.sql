-- LINE integration (#302b): rollback — restrict tour_reminder_log.channel to the
-- original two values. NOTE: will fail if any 'line_push' rows exist; purge them
-- first if a hard rollback is required.

BEGIN;

ALTER TABLE tour_reminder_log DROP CONSTRAINT IF EXISTS tour_reminder_log_channel_check;
ALTER TABLE tour_reminder_log
  ADD CONSTRAINT tour_reminder_log_channel_check
  CHECK (channel IN ('email', 'line_notify_admin'));

COMMIT;
