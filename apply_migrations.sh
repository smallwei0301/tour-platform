#!/bin/bash
# Migration 015: Create guide_availability_rules table
cat <<'EOF' > supabase/migrations/015_guide_availability_rules.sql
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
EOF

# Migration 016: Create guide_blackout_dates table
cat <<'EOF' > supabase/migrations/016_guide_blackout_dates.sql
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
EOF

# Migration 017: Create bookings and booking_status_logs tables
cat <<'EOF' > supabase/migrations/017_bookings.sql
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
EOF

# Migration 018: Activity Packages
cat <<'EOF' > supabase/migrations/018_activity_packages.sql
-- Migration: Activity Packages
-- Description: Add activity packages and package-activity relationships

CREATE TABLE IF NOT EXISTS activity_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  currency TEXT DEFAULT 'TWD',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS package_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES activity_packages(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(package_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_packages_is_active ON activity_packages(is_active);
CREATE INDEX IF NOT EXISTS idx_package_activities_package_id ON package_activities(package_id);
CREATE INDEX IF NOT EXISTS idx_package_activities_activity_id ON package_activities(activity_id);

ALTER TABLE activity_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activity packages are viewable by everyone" ON activity_packages FOR SELECT USING (true);
CREATE POLICY "Activity packages are manageable by authenticated users" ON activity_packages FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Package activities are viewable by everyone" ON package_activities FOR SELECT USING (true);
CREATE POLICY "Package activities are manageable by authenticated users" ON package_activities FOR ALL USING (auth.role() = 'authenticated');

CREATE TRIGGER update_activity_packages_updated_at BEFORE UPDATE ON activity_packages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EOF

# Migration 019: Booking Status Tracking
cat <<'EOF' > supabase/migrations/019_booking_status_tracking.sql
-- Migration: Booking Status Tracking
-- Description: Enhanced booking status tracking and history

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS booking_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status booking_status,
  to_status booking_status NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE bookings ADD COLUMN status booking_status DEFAULT 'pending';
EXCEPTION WHEN duplicate_column THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_booking_status_history_booking_id ON booking_status_history(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_status_history_created_at ON booking_status_history(created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

ALTER TABLE booking_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Booking status history viewable by authenticated users" ON booking_status_history FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Booking status history insertable by authenticated users" ON booking_status_history FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION log_booking_status_change() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO booking_status_history (booking_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER booking_status_change_trigger AFTER UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION log_booking_status_change();
EOF

# Migration 020: Payment Integration
cat <<'EOF' > supabase/migrations/020_payment_integration.sql
-- Migration: Payment Integration
-- Description: Payment records and ECPay integration tracking

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('credit_card', 'atm', 'cvs', 'barcode', 'ecpay');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'TWD',
  status payment_status DEFAULT 'pending',
  method payment_method,
  merchant_trade_no TEXT UNIQUE,
  trade_no TEXT,
  rtn_code TEXT,
  rtn_msg TEXT,
  payment_date TIMESTAMP WITH TIME ZONE,
  payment_type TEXT,
  payment_type_charge_fee DECIMAL(10, 2),
  trade_amt DECIMAL(10, 2),
  trade_date TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_merchant_trade_no ON payments(merchant_trade_no);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_logs_payment_id ON payment_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_created_at ON payment_logs(created_at);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payments viewable by authenticated users" ON payments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Payments manageable by authenticated users" ON payments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Payment logs viewable by authenticated users" ON payment_logs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Payment logs insertable by authenticated users" ON payment_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EOF

# Migration 021: Reporting Analytics
cat <<'EOF' > supabase/migrations/021_reporting_analytics.sql
-- Migration: Reporting and Analytics
-- Description: Views and functions for reporting and analytics

CREATE OR REPLACE VIEW daily_booking_summary AS
SELECT DATE(b.booking_date) as date, COUNT(*) as total_bookings, COUNT(*) FILTER (WHERE b.status = 'confirmed') as confirmed_bookings, COUNT(*) FILTER (WHERE b.status = 'cancelled') as cancelled_bookings, COUNT(*) FILTER (WHERE b.status = 'completed') as completed_bookings, SUM(b.total_participants) as total_participants, SUM(b.total_price) as total_revenue FROM bookings b GROUP BY DATE(b.booking_date) ORDER BY date DESC;

CREATE OR REPLACE VIEW activity_performance AS
SELECT a.id, a.name, COUNT(bi.id) as total_bookings, SUM(bi.quantity) as total_participants, SUM(bi.subtotal) as total_revenue, AVG(bi.unit_price) as avg_price FROM activities a LEFT JOIN booking_items bi ON a.id = bi.activity_id LEFT JOIN bookings b ON bi.booking_id = b.id WHERE b.status IN ('confirmed', 'completed') GROUP BY a.id, a.name ORDER BY total_revenue DESC NULLS LAST;

CREATE OR REPLACE VIEW monthly_revenue_summary AS
SELECT DATE_TRUNC('month', b.booking_date) as month, COUNT(*) as total_bookings, SUM(b.total_participants) as total_participants, SUM(b.total_price) as total_revenue, SUM(p.amount) FILTER (WHERE p.status = 'completed') as collected_revenue, SUM(b.total_price) - COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0) as outstanding_revenue FROM bookings b LEFT JOIN payments p ON b.id = p.booking_id WHERE b.status IN ('confirmed', 'completed') GROUP BY DATE_TRUNC('month', b.booking_date) ORDER BY month DESC;

CREATE OR REPLACE VIEW customer_booking_history AS
SELECT c.id as customer_id, c.name as customer_name, c.email, c.phone, COUNT(b.id) as total_bookings, SUM(b.total_price) as lifetime_value, MAX(b.booking_date) as last_booking_date, MIN(b.booking_date) as first_booking_date FROM customers c LEFT JOIN bookings b ON c.id = b.customer_id WHERE b.status IN ('confirmed', 'completed') GROUP BY c.id, c.name, c.email, c.phone ORDER BY lifetime_value DESC NULLS LAST;

CREATE OR REPLACE VIEW payment_reconciliation AS
SELECT b.id as booking_id, b.booking_number, b.total_price as booking_amount, COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0) as paid_amount, b.total_price - COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0) as outstanding_amount, CASE WHEN COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0) >= b.total_price THEN 'paid' WHEN COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0) > 0 THEN 'partial' ELSE 'unpaid' END as payment_status FROM bookings b LEFT JOIN payments p ON b.id = p.booking_id WHERE b.status IN ('confirmed', 'completed') GROUP BY b.id, b.booking_number, b.total_price ORDER BY b.created_at DESC;

CREATE OR REPLACE FUNCTION get_booking_statistics(start_date DATE, end_date DATE) RETURNS TABLE (total_bookings BIGINT, confirmed_bookings BIGINT, cancelled_bookings BIGINT, total_revenue NUMERIC, total_participants NUMERIC, avg_booking_value NUMERIC) AS $$
BEGIN
  RETURN QUERY SELECT COUNT(*)::BIGINT, COUNT(*) FILTER (WHERE status = 'confirmed')::BIGINT, COUNT(*) FILTER (WHERE status = 'cancelled')::BIGINT, COALESCE(SUM(total_price), 0), COALESCE(SUM(total_participants), 0), COALESCE(AVG(total_price), 0) FROM bookings WHERE DATE(booking_date) BETWEEN start_date AND end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT SELECT ON daily_booking_summary TO authenticated;
GRANT SELECT ON activity_performance TO authenticated;
GRANT SELECT ON monthly_revenue_summary TO authenticated;
GRANT SELECT ON customer_booking_history TO authenticated;
GRANT SELECT ON payment_reconciliation TO authenticated;
EOF
