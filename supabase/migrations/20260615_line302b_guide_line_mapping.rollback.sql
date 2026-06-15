-- Rollback for 20260615_line302b_guide_line_mapping
BEGIN;

DROP TABLE IF EXISTS guide_line_bind_code;
DROP TABLE IF EXISTS guide_line_mapping;

COMMIT;
