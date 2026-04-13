-- Migration 019b: Fix booking status type conversion
-- TP-BP-001 Schema Migration Foundation | 2026-04-13
-- Purpose: Convert bookings.status from TEXT to booking_status ENUM type

-- The booking_status enum is already created in 019, so we just need to convert the column type
-- Since the column was created as TEXT in migration 017, we need to alter it

ALTER TABLE bookings 
ALTER COLUMN status TYPE booking_status 
USING status::booking_status;

-- Set default value to match the enum type
ALTER TABLE bookings 
ALTER COLUMN status SET DEFAULT 'pending'::booking_status;

COMMENT ON COLUMN bookings.status IS 'Booking status: pending, confirmed, cancelled, completed, no_show';
