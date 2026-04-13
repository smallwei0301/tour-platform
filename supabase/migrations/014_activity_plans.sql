-- Migration 014: Create activity_plans table
-- TP-BP-001 Schema Migration Foundation | 2026-04-13
-- 目的：支援多方案架構，讓每個活動可設定多個販售方案

CREATE TABLE IF NOT EXISTS activity_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  price_type TEXT NOT NULL CHECK (price_type IN ('per_person', 'per_group')),
  base_price INTEGER NOT NULL CHECK (base_price >= 0),
  min_participants INTEGER NOT NULL DEFAULT 1 CHECK (min_participants > 0),
  max_participants INTEGER NOT NULL CHECK (max_participants >= min_participants),
  booking_type TEXT NOT NULL DEFAULT 'instant' CHECK (booking_type IN ('scheduled', 'request', 'instant')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT activity_plans_activity_slug_unique UNIQUE(activity_id, slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activity_plans_activity_id ON activity_plans(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_plans_status ON activity_plans(status);

-- Comments
COMMENT ON TABLE activity_plans IS 'Activity pricing plans - supports multiple plans per activity (e.g., private tour, group tour)';
COMMENT ON COLUMN activity_plans.price_type IS 'per_person: price multiplied by participants; per_group: fixed price regardless of count';
COMMENT ON COLUMN activity_plans.booking_type IS 'instant: auto-confirm; request: guide must approve; scheduled: pre-set time slots only';
