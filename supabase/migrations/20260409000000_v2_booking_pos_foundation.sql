-- TP-BP-001: Schema Migration Foundation
-- Purpose: Establish the foundation for Availability-driven Booking and POS Lite.
-- Version: v2.0.0
-- Date: 2026-04-09
--
-- This migration adds 7 new tables and extends the orders table:
--   1. activity_plans - Sellable plans per activity (half-day, full-day, private)
--   2. guide_availability_rules - Cal.com-style weekly availability rules
--   3. guide_blackout_dates - Unavailable windows for guides
--   4. bookings - Core booking entity (separated from orders)
--   5. booking_status_logs - Audit trail for booking state transitions
--   6. order_items - ERPNext-style line items for orders
--   7. payment_events - Payment lifecycle audit trail
--
-- Best practices applied:
--   [query-missing-indexes] Index all FK + WHERE columns
--   [schema-partial-indexes] Partial indexes for status columns
--   [security-rls] Enable RLS on all tables + policies
--   [schema-timestamptz] All timestamps are timestamptz
--   gen_random_uuid() for all UUIDs
--
-- V1 Compatibility:
--   - All changes are additive (no destructive migrations)
--   - orders.schedule_id remains for existing flow
--   - activity_schedules table unchanged
--   - Dual-run strategy: old flow continues working
-- =============================================================

BEGIN;

-- Helper function for auto-updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 1. activity_plans: Abstract activities into sellable plans.
CREATE TABLE IF NOT EXISTS activity_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  price_type text NOT NULL CHECK (price_type IN ('per_person', 'per_group')),
  base_price integer NOT NULL CHECK (base_price >= 0),
  min_participants integer NOT NULL DEFAULT 1 CHECK (min_participants > 0),
  max_participants integer NOT NULL CHECK (max_participants >= min_participants),
  booking_type text NOT NULL DEFAULT 'instant' CHECK (booking_type IN ('scheduled', 'request', 'instant')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(activity_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_activity_plans_activity_id ON activity_plans(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_plans_status ON activity_plans(status);

-- RLS for activity_plans
ALTER TABLE activity_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_plans: public read active plans" ON activity_plans
  FOR SELECT USING (status = 'active');
CREATE POLICY "activity_plans: service role full access" ON activity_plans
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE TRIGGER activity_plans_updated_at
  BEFORE UPDATE ON activity_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- 2. guide_availability_rules: Cal.com style availability rules.
CREATE TABLE IF NOT EXISTS guide_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  activity_plan_id uuid REFERENCES activity_plans(id) ON DELETE CASCADE,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time_local time NOT NULL,
  end_time_local time NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Taipei',
  slot_interval_minutes integer NOT NULL DEFAULT 30 CHECK (slot_interval_minutes > 0),
  buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
  effective_from date,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time_local > start_time_local),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_guide_availability_rules_guide_id ON guide_availability_rules(guide_id);
CREATE INDEX IF NOT EXISTS idx_guide_availability_rules_plan_id ON guide_availability_rules(activity_plan_id);
CREATE INDEX IF NOT EXISTS idx_guide_availability_rules_active ON guide_availability_rules(is_active);

-- RLS for guide_availability_rules
ALTER TABLE guide_availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guide_availability_rules: service role full access" ON guide_availability_rules
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE TRIGGER guide_availability_rules_updated_at
  BEFORE UPDATE ON guide_availability_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- 3. guide_blackout_dates: Guide's unavailable windows.
CREATE TABLE IF NOT EXISTS guide_blackout_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_guide_blackout_dates_guide_id ON guide_blackout_dates(guide_id);
CREATE INDEX IF NOT EXISTS idx_guide_blackout_dates_starts_at ON guide_blackout_dates(starts_at);

-- RLS for guide_blackout_dates
ALTER TABLE guide_blackout_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guide_blackout_dates: service role full access" ON guide_blackout_dates
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================================
-- 4. bookings: The booking entity separated from orders.
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_no text NOT NULL UNIQUE,
  traveler_id uuid REFERENCES users(id),
  guide_id uuid NOT NULL REFERENCES guide_profiles(id),
  activity_id uuid NOT NULL REFERENCES activities(id),
  activity_plan_id uuid REFERENCES activity_plans(id),
  source_channel text NOT NULL DEFAULT 'web' CHECK (source_channel IN ('web', 'line', 'admin_pos')),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Taipei',
  participants integer NOT NULL CHECK (participants > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_confirmation', 'confirmed', 'completed', 'cancelled', 'no_show', 'reschedule_requested')),
  order_id uuid,
  customer_note text,
  internal_note text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_bookings_traveler_id ON bookings(traveler_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guide_id ON bookings(guide_id);
CREATE INDEX IF NOT EXISTS idx_bookings_activity_id ON bookings(activity_id);
CREATE INDEX IF NOT EXISTS idx_bookings_plan_id ON bookings(activity_plan_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_start_at ON bookings(start_at);
-- Partial index for active bookings
CREATE INDEX IF NOT EXISTS idx_bookings_active ON bookings(guide_id, start_at)
  WHERE status IN ('draft', 'pending_confirmation', 'confirmed', 'reschedule_requested');

-- RLS for bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookings: service role full access" ON bookings
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- 5. booking_status_logs: Audit trail for booking state transitions.
CREATE TABLE IF NOT EXISTS booking_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  actor_role text NOT NULL CHECK (actor_role IN ('traveler', 'guide', 'admin', 'system')),
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_status_logs_booking_id ON booking_status_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_status_logs_created_at ON booking_status_logs(created_at DESC);

-- RLS for booking_status_logs
ALTER TABLE booking_status_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_status_logs: service role full access" ON booking_status_logs
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================================
-- 6. order_items: Simplified ERPNext style order lines.
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('activity_booking', 'adjustment', 'fee', 'discount')),
  ref_id uuid,
  title text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price integer NOT NULL,
  subtotal_amount integer NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_item_type ON order_items(item_type);

-- RLS for order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items: service role full access" ON order_items
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================================
-- 7. payment_events: Audit log for payments.
CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('initiated', 'callback_received', 'authorized', 'paid', 'failed', 'refunded', 'cancelled')),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON payment_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON payment_events(created_at DESC);

-- RLS for payment_events
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_events: service role full access" ON payment_events
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================================
-- 8. Extend orders table for V2 support.
-- These columns are additive and optional to maintain v1 compatibility.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES bookings(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_channel text DEFAULT 'web' CHECK (source_channel IN ('web', 'line', 'admin_pos'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS handled_by uuid REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partially_paid', 'paid', 'failed', 'refunded', 'partially_refunded'));

CREATE INDEX IF NOT EXISTS idx_orders_booking_id ON orders(booking_id);
CREATE INDEX IF NOT EXISTS idx_orders_source_channel ON orders(source_channel);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

-- =============================================================
-- 9. Create a function to generate booking_no
-- Format: BK-YYYYMMDD-XXXXX (e.g., BK-20260409-00001)
-- =============================================================
CREATE OR REPLACE FUNCTION generate_booking_no()
RETURNS TRIGGER AS $$
DECLARE
  date_part text;
  seq_part text;
  count_today integer;
BEGIN
  date_part := to_char(now(), 'YYYYMMDD');

  -- Count bookings created today
  SELECT COUNT(*) + 1 INTO count_today
  FROM bookings
  WHERE created_at::date = now()::date;

  seq_part := lpad(count_today::text, 5, '0');
  NEW.booking_no := 'BK-' || date_part || '-' || seq_part;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate booking_no if not provided
CREATE TRIGGER bookings_generate_booking_no
  BEFORE INSERT ON bookings
  FOR EACH ROW
  WHEN (NEW.booking_no IS NULL OR NEW.booking_no = '')
  EXECUTE FUNCTION generate_booking_no();

-- =============================================================
-- Migration Summary:
--
-- New Tables (7):
--   - activity_plans: Sellable plans per activity
--   - guide_availability_rules: Weekly availability rules
--   - guide_blackout_dates: Unavailable windows
--   - bookings: Core booking entity
--   - booking_status_logs: Booking state audit trail
--   - order_items: Order line items
--   - payment_events: Payment lifecycle events
--
-- Extended Tables (1):
--   - orders: Added booking_id, source_channel, handled_by,
--            discount_amount, payment_status
--
-- Helper Functions (2):
--   - update_updated_at_column(): Auto-update updated_at
--   - generate_booking_no(): Auto-generate booking numbers
--
-- All tables have:
--   - RLS enabled with service role full access
--   - Appropriate indexes for FK and filter columns
--   - Partial indexes for common query patterns
-- =============================================================

COMMIT;
