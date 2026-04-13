-- Migration 016: Create guide_blackout_dates table
-- TP-BP-001 Schema Migration Foundation | 2026-04-13
-- 目的：支援導遊黑名單日期（請假、私人事務等不可預訂時段）

CREATE TABLE IF NOT EXISTS guide_blackout_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guide_blackout_dates_guide_id ON guide_blackout_dates(guide_id);
CREATE INDEX IF NOT EXISTS idx_guide_blackout_dates_starts_at ON guide_blackout_dates(starts_at);

-- Comments
COMMENT ON TABLE guide_blackout_dates IS 'Guide blackout dates - periods when guide is unavailable (vacation, personal time, etc.)';
COMMENT ON COLUMN guide_blackout_dates.source IS 'manual: set by guide/admin; system: auto-generated (e.g., from booking conflicts)';
