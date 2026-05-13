-- Migration: Issue #497 — Add 'archived' to activity_plans status CHECK constraint
-- Canonical vocabulary: active | inactive | archived
-- Previously: CHECK (status IN ('active', 'inactive'))
-- After: CHECK (status IN ('active', 'inactive', 'archived'))

ALTER TABLE activity_plans
  DROP CONSTRAINT IF EXISTS activity_plans_status_check;

ALTER TABLE activity_plans
  ADD CONSTRAINT activity_plans_status_check
  CHECK (status IN ('active', 'inactive', 'archived'));

COMMENT ON COLUMN activity_plans.status IS
  'Lifecycle status: active=bookable by travelers; inactive=not bookable but visible to guide; archived=soft-deleted, hidden from traveler view';
