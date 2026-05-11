-- Rollback: Issue #325 — incidents table
-- Removes the incidents table and all associated objects

BEGIN;

DROP TABLE IF EXISTS incidents CASCADE;

COMMIT;
