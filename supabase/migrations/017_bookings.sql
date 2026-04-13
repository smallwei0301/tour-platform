-- Migration 017: Create bookings and booking_status_logs tables
-- TP-BP-001 Schema Migration Foundation | 2026-04-13
-- 目的：建立核心預訂實體，與 orders 分離，支援多渠道預訂流程

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_no TEXT NOT NULL UNIQUE,
  traveler_id UUID REFERENCES users(id),
  guide_id UUID NOT NULL REFERENCES guide_profiles(id),
  activity_id UUID NOT NULL REFERENCES activities(id),
  activity_plan_id UUID REFERENCES activity_plans(id),
  source_channel TEXT NOT NULL DEFAULT 'web' CHECK (source_channel IN ('web', 'line', 'admin_pos')),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  participants INTEGER NOT NULL CHECK (participants > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_confirmation', 'confirmed', 'completed', 'cancelled', 'no_show', 'reschedule_requested')),
  order_id UUID,
  customer_note TEXT,
  internal_note TEXT,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_traveler_id ON bookings(traveler_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guide_id ON bookings(guide_id);
CREATE INDEX IF NOT EXISTS idx_bookings_activity_id ON bookings(activity_id);
CREATE INDEX IF NOT EXISTS idx_bookings_plan_id ON bookings(activity_plan_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_start_at ON bookings(start_at);

-- Comments
COMMENT ON TABLE bookings IS 'Core booking entity - separates booking lifecycle from payment/order lifecycle';
COMMENT ON COLUMN bookings.booking_no IS 'Unique booking reference number (e.g., BK20260413001)';
COMMENT ON COLUMN bookings.source_channel IS 'web: website; line: LINE/LIFF; admin_pos: admin POS system';
COMMENT ON COLUMN bookings.status IS 'Booking lifecycle: draft -> pending_confirmation -> confirmed -> completed';

-- Booking status logs table
CREATE TABLE IF NOT EXISTS booking_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('traveler', 'guide', 'admin', 'system')),
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_booking_status_logs_booking_id ON booking_status_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_status_logs_created_at ON booking_status_logs(created_at DESC);

-- Comments
COMMENT ON TABLE booking_status_logs IS 'Audit trail for all booking status transitions';
COMMENT ON COLUMN booking_status_logs.actor_role IS 'Role of the user/system that triggered the status change';
