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
