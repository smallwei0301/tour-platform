-- issue #597: align payment_events schema with live callback/manual/additional-payment paths
-- additive/compat only; no destructive drops

BEGIN;

ALTER TABLE payment_events
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trade_no text;

-- refund callback path inserts by order_id/event_type/trade_no and may not have payment_id at write time
ALTER TABLE payment_events
  ALTER COLUMN payment_id DROP NOT NULL;

-- extend event type contract to include current app events
ALTER TABLE payment_events
  DROP CONSTRAINT IF EXISTS payment_events_event_type_check;

ALTER TABLE payment_events
  ADD CONSTRAINT payment_events_event_type_check CHECK (
    event_type IN (
      'initiated',
      'initiated_reused',
      'callback_received',
      'authorized',
      'paid',
      'failed',
      'refunded',
      'cancelled',
      'additional_payment'
    )
  );

-- backfill additive columns from payments where possible
UPDATE payment_events pe
SET
  order_id = COALESCE(pe.order_id, p.order_id),
  trade_no = COALESCE(pe.trade_no, p.trade_no)
FROM payments p
WHERE pe.payment_id = p.id
  AND (pe.order_id IS NULL OR pe.trade_no IS NULL);

CREATE INDEX IF NOT EXISTS idx_payment_events_order_id ON payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_trade_no ON payment_events(trade_no) WHERE trade_no IS NOT NULL;

COMMIT;
