-- issue #48: use PostgreSQL sequence for booking_no generation

CREATE SEQUENCE IF NOT EXISTS orders_booking_no_seq START WITH 100000;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS booking_no BIGINT;

-- backfill existing rows
UPDATE orders
SET booking_no = nextval('orders_booking_no_seq')
WHERE booking_no IS NULL;

-- ensure future inserts always get booking_no
CREATE OR REPLACE FUNCTION set_order_booking_no()
RETURNS trigger AS $$
BEGIN
  IF NEW.booking_no IS NULL THEN
    NEW.booking_no := nextval('orders_booking_no_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_order_booking_no ON orders;
CREATE TRIGGER trg_set_order_booking_no
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_booking_no();

-- uniqueness for business lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_booking_no_unique ON orders(booking_no);
