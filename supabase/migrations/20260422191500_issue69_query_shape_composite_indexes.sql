-- issue #69: query-shape-aligned composite indexes (bounded slice)
-- Notes:
-- - additive only; no historical migration edits
-- - avoid duplicates with existing single-column/partial indexes

-- orders: user-centric timeline
CREATE INDEX IF NOT EXISTS idx_orders_user_id_created_at_desc
  ON orders(user_id, created_at DESC);

-- orders: status queue/timeline
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at_desc
  ON orders(status, created_at DESC);

-- guide applications: status queue/timeline
CREATE INDEX IF NOT EXISTS idx_guide_applications_status_created_at_desc
  ON guide_applications(status, created_at DESC);

-- operations tracking: recent updates view
CREATE INDEX IF NOT EXISTS idx_operations_tracking_updated_at_desc
  ON operations_tracking(updated_at DESC);

-- activities: guide-scope status filter
CREATE INDEX IF NOT EXISTS idx_activities_guide_slug_status
  ON activities(guide_slug, status);

-- constrained published-activities path aligned to listPublishedActivitiesDb
-- (status='published' + ORDER BY published_at DESC without requiring region/category predicate)
CREATE INDEX IF NOT EXISTS idx_activities_published_published_at_desc
  ON activities(published_at DESC)
  WHERE status = 'published';
