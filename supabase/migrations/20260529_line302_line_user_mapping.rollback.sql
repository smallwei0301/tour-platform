-- LINE integration (#302b): rollback — drop line_user_mapping
-- Tour Platform

BEGIN;

DROP TABLE IF EXISTS line_user_mapping;

COMMIT;
