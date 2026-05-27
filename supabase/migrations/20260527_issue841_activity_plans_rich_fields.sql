-- GH-841: formal activity_plans rich contract fields (additive)
-- Keep legacy activities.plans JSON for compatibility/backfill source.

ALTER TABLE activity_plans
  ADD COLUMN IF NOT EXISTS legacy_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS details_link_text TEXT,
  ADD COLUMN IF NOT EXISTS booking_btn_text TEXT,
  ADD COLUMN IF NOT EXISTS highlights JSONB,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS earliest_departure TEXT,
  ADD COLUMN IF NOT EXISTS confirm_by_days INTEGER,
  ADD COLUMN IF NOT EXISTS free_cancel_days INTEGER,
  ADD COLUMN IF NOT EXISTS plan_inclusions JSONB,
  ADD COLUMN IF NOT EXISTS plan_exclusions JSONB,
  ADD COLUMN IF NOT EXISTS plan_itinerary_image_url TEXT,
  ADD COLUMN IF NOT EXISTS meeting_point_name TEXT,
  ADD COLUMN IF NOT EXISTS meeting_address TEXT,
  ADD COLUMN IF NOT EXISTS experience_point_name TEXT,
  ADD COLUMN IF NOT EXISTS experience_address TEXT,
  ADD COLUMN IF NOT EXISTS plan_notices JSONB,
  ADD COLUMN IF NOT EXISTS plan_refund_rules JSONB;

CREATE INDEX IF NOT EXISTS idx_activity_plans_activity_legacy_plan_id
  ON activity_plans(activity_id, legacy_plan_id);

COMMENT ON COLUMN activity_plans.legacy_plan_id IS 'legacy activities.plans[].id for deterministic backfill and reconciliation';
COMMENT ON COLUMN activity_plans.highlights IS 'legacy activities.plans[].highlights (string array)';
COMMENT ON COLUMN activity_plans.plan_inclusions IS 'legacy activities.plans[].planInclusions (string array)';
COMMENT ON COLUMN activity_plans.plan_exclusions IS 'legacy activities.plans[].planExclusions (string array)';
COMMENT ON COLUMN activity_plans.plan_notices IS 'legacy activities.plans[].planNotices (string array)';
COMMENT ON COLUMN activity_plans.plan_refund_rules IS 'legacy activities.plans[].planRefundRules (string array)';
