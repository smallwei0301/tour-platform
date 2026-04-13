-- Migration 015: Create guide_availability_rules table
-- TP-BP-001 Schema Migration Foundation | 2026-04-13
-- 目的：支援導遊可用時段規則，作為 availability-driven booking 基礎

CREATE TABLE IF NOT EXISTS guide_availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  activity_plan_id UUID REFERENCES activity_plans(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time_local TIME NOT NULL,
  end_time_local TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_interval_minutes > 0),
  buffer_before_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
  effective_from DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time_local > start_time_local),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guide_availability_rules_guide_id ON guide_availability_rules(guide_id);
CREATE INDEX IF NOT EXISTS idx_guide_availability_rules_plan_id ON guide_availability_rules(activity_plan_id);
CREATE INDEX IF NOT EXISTS idx_guide_availability_rules_active ON guide_availability_rules(is_active);

-- Comments
COMMENT ON TABLE guide_availability_rules IS 'Guide availability rules - defines recurring weekly time slots for guide availability';
COMMENT ON COLUMN guide_availability_rules.weekday IS '0=Sunday, 1=Monday, ..., 6=Saturday';
COMMENT ON COLUMN guide_availability_rules.slot_interval_minutes IS 'Interval between available time slots (e.g., 30 = slots every 30 minutes)';
COMMENT ON COLUMN guide_availability_rules.buffer_before_minutes IS 'Buffer time before booking starts';
COMMENT ON COLUMN guide_availability_rules.buffer_after_minutes IS 'Buffer time after booking ends';
