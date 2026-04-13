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
