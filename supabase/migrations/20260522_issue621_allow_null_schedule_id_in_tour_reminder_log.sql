-- Issue #621: Allow V2-only reminder logs without legacy activity_schedules rows
-- Keep idempotency key unchanged: UNIQUE(order_id, reminder_kind, channel)

BEGIN;

ALTER TABLE tour_reminder_log
  ALTER COLUMN schedule_id DROP NOT NULL;

COMMIT;
