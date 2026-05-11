-- Rollback: Issue #361 activity_qa table
BEGIN;
DROP TABLE IF EXISTS public.activity_qa CASCADE;
COMMIT;
