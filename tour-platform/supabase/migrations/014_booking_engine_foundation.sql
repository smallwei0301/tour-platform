-- ============================================================================
-- Migration 014: Booking Engine Foundation
-- ============================================================================
-- Description: Core booking engine tables and structures for tour platform
-- Created: 2026-04-13
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Drop existing objects (reverse dependency order)
-- ============================================================================

DROP TRIGGER IF EXISTS update_booking_items_updated_at ON booking_items;
DROP TRIGGER IF EXISTS update_payment_logs_updated_at ON payment_logs;
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
DROP TRIGGER IF EXISTS update_package_activities_updated_at ON package_activities;
DROP TRIGGER IF EXISTS update_activity_packages_updated_at ON activity_packages;
DROP TRIGGER IF EXISTS update_booking_status_logs_updated_at ON booking_status_logs;
DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
DROP TRIGGER IF EXISTS update_guide_blackout_dates_updated_at ON guide_blackout_dates;
DROP TRIGGER IF EXISTS update_guide_availability_rules_updated_at ON guide_availability_rules;
DROP TRIGGER IF EXISTS update_activity_plans_updated_at ON activity_plans;
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;

DROP TABLE IF EXISTS booking_items CASCADE;
DROP TABLE IF EXISTS payment_logs CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS package_activities CASCADE;
DROP TABLE IF EXISTS activity_packages CASCADE;
DROP TABLE IF EXISTS booking_status_logs CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS guide_blackout_dates CASCADE;
DROP TABLE IF EXISTS guide_availability_rules CASCADE;
DROP TABLE IF EXISTS activity_plans CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================================================
-- Utility Functions
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Table: customers
-- ============================================================================

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    preferred_language VARCHAR(10) DEFAULT 'zh-TW',
    customer_notes TEXT,
    total_bookings INTEGER DEFAULT 0,
    total_spent DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_created_at ON customers(created_at DESC);

COMMENT ON TABLE customers IS 'Customer information and profile data';
COMMENT ON COLUMN customers.email IS 'Customer email address (unique identifier)';
COMMENT ON COLUMN customers.preferred_language IS 'Preferred language for communications (e.g., zh-TW, en-US)';
COMMENT ON COLUMN customers.total_bookings IS 'Total number of bookings made by this customer';
COMMENT ON COLUMN customers.total_spent IS 'Total amount spent by this customer across all bookings';

-- ============================================================================
-- Table: activity_plans
-- ============================================================================

CREATE TABLE activity_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    plan_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 10,
    current_participants INTEGER DEFAULT 0,
    guide_id UUID REFERENCES guide_profiles(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed')),
    price_override DECIMAL(10, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_time_order CHECK (end_time > start_time),
    CONSTRAINT check_participants CHECK (current_participants <= max_participants)
);

CREATE INDEX idx_activity_plans_activity_id ON activity_plans(activity_id);
CREATE INDEX idx_activity_plans_plan_date ON activity_plans(plan_date);
CREATE INDEX idx_activity_plans_guide_id ON activity_plans(guide_id);
CREATE INDEX idx_activity_plans_status ON activity_plans(status);
CREATE INDEX idx_activity_plans_activity_date ON activity_plans(activity_id, plan_date);

COMMENT ON TABLE activity_plans IS 'Scheduled activity instances with specific dates, times, and capacity';
COMMENT ON COLUMN activity_plans.plan_date IS 'Date when the activity is scheduled';
COMMENT ON COLUMN activity_plans.current_participants IS 'Number of participants currently booked';
COMMENT ON COLUMN activity_plans.price_override IS 'Optional price override for this specific plan instance';

-- ============================================================================
-- Table: guide_availability_rules
-- ============================================================================

CREATE TABLE guide_availability_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guide_id UUID NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_time_order_availability CHECK (end_time > start_time)
);

CREATE INDEX idx_guide_availability_guide_id ON guide_availability_rules(guide_id);
CREATE INDEX idx_guide_availability_day ON guide_availability_rules(day_of_week);

COMMENT ON TABLE guide_availability_rules IS 'Recurring weekly availability rules for guides';
COMMENT ON COLUMN guide_availability_rules.day_of_week IS 'Day of week (0=Sunday, 1=Monday, ..., 6=Saturday)';
COMMENT ON COLUMN guide_availability_rules.is_available IS 'Whether guide is available during this time slot';

-- ============================================================================
-- Table: guide_blackout_dates
-- ============================================================================

CREATE TABLE guide_blackout_dates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guide_id UUID NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_date_order CHECK (end_date >= start_date)
);

CREATE INDEX idx_guide_blackout_guide_id ON guide_blackout_dates(guide_id);
CREATE INDEX idx_guide_blackout_dates ON guide_blackout_dates(start_date, end_date);

COMMENT ON TABLE guide_blackout_dates IS 'Specific dates when guides are unavailable (vacation, holidays, etc.)';
COMMENT ON COLUMN guide_blackout_dates.reason IS 'Optional reason for unavailability';

-- ============================================================================
-- Table: bookings
-- ============================================================================

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    activity_plan_id UUID REFERENCES activity_plans(id) ON DELETE RESTRICT,
    booking_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
    number_of_participants INTEGER NOT NULL DEFAULT 1,
    total_amount DECIMAL(10, 2) NOT NULL,
    deposit_amount DECIMAL(10, 2) DEFAULT 0.00,
    paid_amount DECIMAL(10, 2) DEFAULT 0.00,
    payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),
    payment_method VARCHAR(50),
    special_requests TEXT,
    internal_notes TEXT,
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_participants_positive CHECK (number_of_participants > 0),
    CONSTRAINT check_amounts CHECK (paid_amount <= total_amount AND deposit_amount <= total_amount)
);

CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX idx_bookings_activity_plan_id ON bookings(activity_plan_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX idx_bookings_booking_date ON bookings(booking_date DESC);
CREATE INDEX idx_bookings_booking_number ON bookings(booking_number);

COMMENT ON TABLE bookings IS 'Customer bookings for activities';
COMMENT ON COLUMN bookings.booking_number IS 'Unique human-readable booking reference number';
COMMENT ON COLUMN bookings.payment_status IS 'Payment status independent of booking status';
COMMENT ON COLUMN bookings.deposit_amount IS 'Required deposit amount';
COMMENT ON COLUMN bookings.paid_amount IS 'Total amount paid so far';

-- ============================================================================
-- Table: booking_status_logs
-- ============================================================================

CREATE TABLE booking_status_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    change_reason TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_booking_status_logs_booking_id ON booking_status_logs(booking_id);
CREATE INDEX idx_booking_status_logs_changed_at ON booking_status_logs(changed_at DESC);

COMMENT ON TABLE booking_status_logs IS 'Audit log for booking status changes';
COMMENT ON COLUMN booking_status_logs.changed_by IS 'User who made the status change';

-- ============================================================================
-- Table: activity_packages
-- ============================================================================\n\nCREATE TABLE activity_packages (\n    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n    package_name VARCHAR(255) NOT NULL,\n    description TEXT,\n    package_price DECIMAL(10, 2) NOT NULL,\n    is_active BOOLEAN DEFAULT true,\n    valid_from DATE,\n    valid_until DATE,\n    max_participants INTEGER,\n    terms_and_conditions TEXT,\n    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    CONSTRAINT check_package_price CHECK (package_price >= 0),\n    CONSTRAINT check_validity_dates CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)\n);\n\nCREATE INDEX idx_activity_packages_is_active ON activity_packages(is_active);\nCREATE INDEX idx_activity_packages_valid_dates ON activity_packages(valid_from, valid_until);\n\nCOMMENT ON TABLE activity_packages IS 'Bundled activity packages with special pricing';\nCOMMENT ON COLUMN activity_packages.package_price IS 'Special bundled price for the package';\nCOMMENT ON COLUMN activity_packages.valid_from IS 'Start date of package validity';\nCOMMENT ON COLUMN activity_packages.valid_until IS 'End date of package validity';\n\n-- ============================================================================\n-- Table: package_activities\n-- ============================================================================\n\nCREATE TABLE package_activities (\n    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n    package_id UUID NOT NULL REFERENCES activity_packages(id) ON DELETE CASCADE,\n    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,\n    quantity INTEGER DEFAULT 1,\n    sequence_order INTEGER,\n    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    CONSTRAINT check_quantity_positive CHECK (quantity > 0),\n    UNIQUE(package_id, activity_id)\n);\n\nCREATE INDEX idx_package_activities_package_id ON package_activities(package_id);\nCREATE INDEX idx_package_activities_activity_id ON package_activities(activity_id);\n\nCOMMENT ON TABLE package_activities IS 'Activities included in packages (many-to-many relationship)';\nCOMMENT ON COLUMN package_activities.quantity IS 'Number of times this activity is included in the package';\nCOMMENT ON COLUMN package_activities.sequence_order IS 'Suggested order for activities in the package';\n\n-- ============================================================================\n-- Table: payments\n-- ============================================================================\n\nCREATE TABLE payments (\n    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,\n    payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    amount DECIMAL(10, 2) NOT NULL,\n    payment_method VARCHAR(50) NOT NULL,\n    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),\n    transaction_id VARCHAR(255),\n    gateway_response JSONB,\n    refund_amount DECIMAL(10, 2) DEFAULT 0.00,\n    refund_date TIMESTAMP WITH TIME ZONE,\n    notes TEXT,\n    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    CONSTRAINT check_payment_amount CHECK (amount > 0),\n    CONSTRAINT check_refund_amount CHECK (refund_amount >= 0 AND refund_amount <= amount)\n);\n\nCREATE INDEX idx_payments_booking_id ON payments(booking_id);\nCREATE INDEX idx_payments_payment_status ON payments(payment_status);\nCREATE INDEX idx_payments_payment_date ON payments(payment_date DESC);\nCREATE INDEX idx_payments_transaction_id ON payments(transaction_id);\n\nCOMMENT ON TABLE payments IS 'Payment transactions for bookings';\nCOMMENT ON COLUMN payments.gateway_response IS 'JSON response from payment gateway';\nCOMMENT ON COLUMN payments.transaction_id IS 'External payment gateway transaction identifier';\n\n-- ============================================================================\n-- Table: payment_logs\n-- ============================================================================\n\nCREATE TABLE payment_logs (\n    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,\n    log_type VARCHAR(50) NOT NULL,\n    log_message TEXT,\n    log_data JSONB,\n    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE INDEX idx_payment_logs_payment_id ON payment_logs(payment_id);\nCREATE INDEX idx_payment_logs_logged_at ON payment_logs(logged_at DESC);\nCREATE INDEX idx_payment_logs_log_type ON payment_logs(log_type);\n\nCOMMENT ON TABLE payment_logs IS 'Detailed audit log for payment events and gateway communications';\nCOMMENT ON COLUMN payment_logs.log_type IS 'Type of log entry (e.g., gateway_request, gateway_response, error, refund)';\n\n-- ============================================================================\n-- Table: booking_items\n-- ============================================================================\n\nCREATE TABLE booking_items (\n    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,\n    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('activity', 'package', 'addon')),\n    activity_id UUID REFERENCES activities(id) ON DELETE RESTRICT,\n    package_id UUID REFERENCES activity_packages(id) ON DELETE RESTRICT,\n    quantity INTEGER DEFAULT 1,\n    unit_price DECIMAL(10, 2) NOT NULL,\n    subtotal DECIMAL(10, 2) NOT NULL,\n    discount_amount DECIMAL(10, 2) DEFAULT 0.00,\n    tax_amount DECIMAL(10, 2) DEFAULT 0.00,\n    total_amount DECIMAL(10, 2) NOT NULL,\n    item_notes TEXT,\n    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    CONSTRAINT check_booking_item_quantity CHECK (quantity > 0),\n    CONSTRAINT check_booking_item_amounts CHECK (\n        subtotal = unit_price * quantity AND\n        total_amount = subtotal - COALESCE(discount_amount, 0) + COALESCE(tax_amount, 0)\n    ),\n    CONSTRAINT check_booking_item_reference CHECK (\n        (item_type = 'activity' AND activity_id IS NOT NULL AND package_id IS NULL) OR\n        (item_type = 'package' AND package_id IS NOT NULL AND activity_id IS NULL) OR\n        (item_type = 'addon' AND activity_id IS NOT NULL AND package_id IS NULL)\n    )\n);\n\nCREATE INDEX idx_booking_items_booking_id ON booking_items(booking_id);\nCREATE INDEX idx_booking_items_activity_id ON booking_items(activity_id);\nCREATE INDEX idx_booking_items_package_id ON booking_items(package_id);\nCREATE INDEX idx_booking_items_item_type ON booking_items(item_type);\n\nCOMMENT ON TABLE booking_items IS 'Line items for bookings (activities, packages, or add-ons)';\nCOMMENT ON COLUMN booking_items.item_type IS 'Type of item: activity, package, or addon';\nCOMMENT ON COLUMN booking_items.subtotal IS 'Unit price × quantity';\nCOMMENT ON COLUMN booking_items.total_amount IS 'Subtotal - discount + tax';\n\n-- ============================================================================\n-- Triggers\n-- ============================================================================\n\nCREATE TRIGGER update_customers_updated_at\n    BEFORE UPDATE ON customers\n    FOR EACH ROW\n    EXECUTE FUNCTION update_updated_at_column();\n\nCREATE TRIGGER update_activity_plans_updated_at\n    BEFORE UPDATE ON activity_plans\n    FOR EACH ROW\n    EXECUTE FUNCTION update_updated_at_column();\n\nCREATE TRIGGER update_guide_availability_rules_updated_at\n    BEFORE UPDATE ON guide_availability_rules\n    FOR EACH ROW\n    EXECUTE FUNCTION update_updated_at_column();\n\nCREATE TRIGGER update_guide_blackout_dates_updated_at\n    BEFORE UPDATE ON guide_blackout_dates\n    FOR EACH ROW\n    EXECUTE FUNCTION update_updated_at_column();\n\nCREATE TRIGGER update_bookings_updated_at\n    BEFORE UPDATE ON bookings\n    FOR EACH ROW\n    EXECUTE FUNCTION update_updated_at_column();\n\nCREATE TRIGGER update_booking_status_logs_updated_at\n    BEFORE UPDATE ON booking_status_logs\n    FOR EACH ROW\n    EXECUTE FUNCTION update_updated_at_column();\n\nCREATE TRIGGER update_activity_packages_updated_at\n    BEFORE UPDATE ON activity_packages\n    FOR EACH ROW\n    EXECUTE FUNCTION update_updated_at_column();\n\nCREATE TRIGGER update_package_activities_updated_at\n    BEFORE UPDATE ON package_activities\n    FOR EACH ROW\n    EXECUTE FUNCTION update_updated_at_column();\n\nCREATE TRIGGER update_payments_updated_at\n    BEFORE UPDATE ON payments\n    FOR EACH ROW\n    EXECUTE FUNCTION update_updated_at_column();\n\nCREATE TRIGGER update_payment_logs_updated_at\n    BEFORE UPDATE ON payment_logs\n    FOR EACH ROW\n    EXECUTE FUNCTION update_updated_at_column();\n\nCREATE TRIGGER update_booking_items_updated_at\n    BEFORE UPDATE ON booking_items\n    FOR EACH ROW\n    EXECUTE FUNCTION update_updated_at_column();\n\n-- ============================================================================\n-- End of Migration 014\n-- ============================================================================\nEOF\n-- ============================================================================
-- Reporting and Analytics Views
-- ============================================================================

CREATE OR REPLACE VIEW daily_booking_summary AS
SELECT
  DATE(b.booking_date) as date,
  COUNT(*) as total_bookings,
  COUNT(*) FILTER (WHERE b.status = 'confirmed') as confirmed_bookings,
  COUNT(*) FILTER (WHERE b.status = 'cancelled') as cancelled_bookings,
  COUNT(*) FILTER (WHERE b.status = 'completed') as completed_bookings,
  SUM(b.number_of_participants) as total_participants,
  SUM(b.total_amount) as total_revenue
FROM bookings b
GROUP BY DATE(b.booking_date)
ORDER BY date DESC;

CREATE OR REPLACE VIEW activity_performance AS
SELECT
  a.id,
  a.title as name,
  COUNT(bi.id) as total_bookings,
  SUM(bi.quantity) as total_participants,
  SUM(bi.subtotal) as total_revenue,
  AVG(bi.unit_price) as avg_price
FROM activities a
LEFT JOIN booking_items bi ON a.id = bi.activity_id
LEFT JOIN bookings b ON bi.booking_id = b.id
WHERE b.status IN ('confirmed', 'completed')
GROUP BY a.id, a.title
ORDER BY total_revenue DESC NULLS LAST;

CREATE OR REPLACE VIEW monthly_revenue_summary AS
SELECT
  DATE_TRUNC('month', b.booking_date) as month,
  COUNT(*) as total_bookings,
  SUM(b.number_of_participants) as total_participants,
  SUM(b.total_amount) as total_revenue,
  SUM(p.amount) FILTER (WHERE p.payment_status = 'completed') as collected_revenue,
  SUM(b.total_amount) - COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'completed'), 0) as outstanding_revenue
FROM bookings b
LEFT JOIN payments p ON b.id = p.booking_id
WHERE b.status IN ('confirmed', 'completed')
GROUP BY DATE_TRUNC('month', b.booking_date)
ORDER BY month DESC;

CREATE OR REPLACE VIEW customer_booking_history AS
SELECT
  c.id as customer_id,
  c.first_name || ' ' || c.last_name as customer_name,
  c.email,
  c.phone,
  COUNT(b.id) as total_bookings,
  SUM(b.total_amount) as lifetime_value,
  MAX(b.booking_date) as last_booking_date,
  MIN(b.booking_date) as first_booking_date
FROM customers c
LEFT JOIN bookings b ON c.id = b.customer_id
WHERE b.status IN ('confirmed', 'completed')
GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone
ORDER BY lifetime_value DESC NULLS LAST;

CREATE OR REPLACE VIEW payment_reconciliation AS
SELECT
  b.id as booking_id,
  b.booking_number,
  b.total_amount as booking_amount,
  COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'completed'), 0) as paid_amount,
  b.total_amount - COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'completed'), 0) as outstanding_amount,
  CASE
    WHEN COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'completed'), 0) >= b.total_amount THEN 'paid'
    WHEN COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'completed'), 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END as payment_status
FROM bookings b
LEFT JOIN payments p ON b.id = p.booking_id
WHERE b.status IN ('confirmed', 'completed')
GROUP BY b.id, b.booking_number, b.total_amount
ORDER BY b.created_at DESC;

CREATE OR REPLACE FUNCTION get_booking_statistics(start_date DATE, end_date DATE)
RETURNS TABLE (
  total_bookings BIGINT,
  confirmed_bookings BIGINT,
  cancelled_bookings BIGINT,
  total_revenue NUMERIC,
  total_participants NUMERIC,
  avg_booking_value NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_bookings,
    COUNT(*) FILTER (WHERE status = 'confirmed')::BIGINT as confirmed_bookings,
    COUNT(*) FILTER (WHERE status = 'cancelled')::BIGINT as cancelled_bookings,
    COALESCE(SUM(total_amount), 0) as total_revenue,
    COALESCE(SUM(number_of_participants), 0) as total_participants,
    COALESCE(AVG(total_amount), 0) as avg_booking_value
  FROM bookings
  WHERE DATE(booking_date) BETWEEN start_date AND end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT SELECT ON daily_booking_summary TO authenticated;
GRANT SELECT ON activity_performance TO authenticated;
GRANT SELECT ON monthly_revenue_summary TO authenticated;
GRANT SELECT ON customer_booking_history TO authenticated;
GRANT SELECT ON payment_reconciliation TO authenticated;
