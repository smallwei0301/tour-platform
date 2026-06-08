-- LINE integration (#302b): rollback — drop line_webhook_events
-- Tour Platform

BEGIN;

DROP TABLE IF EXISTS line_webhook_events;

COMMIT;
