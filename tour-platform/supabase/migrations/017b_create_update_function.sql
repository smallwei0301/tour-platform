-- Migration 017b: Create update_updated_at_column function
-- TP-BP-001 Schema Migration Foundation | 2026-04-13
-- Purpose: Define the update_updated_at_column function required by migrations 018, 019, and 020

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS 'Trigger function to automatically update updated_at timestamp';
