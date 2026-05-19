-- issue #614.1: ECPay payment domain foundation (additive only)
-- scope: payments/payment_events schema expansion, idempotency indexes, RLS hardening,
-- and callback RPC contract extension for merchant_trade_no/provider payload.

BEGIN;

-- ------------------------------------------------------------------
-- payments: additive columns for full provider lifecycle tracking
-- ------------------------------------------------------------------
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS merchant_trade_no text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'TWD',
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS captured_amount_twd integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_amount_twd integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_provider_query_payload jsonb;

-- keep amount/payment semantics in integer TWD domain used by current orders.total_twd.
ALTER TABLE payments
  ALTER COLUMN amount_twd SET DEFAULT 0;

-- Ensure provider default remains ecpay for this workflow.
ALTER TABLE payments
  ALTER COLUMN provider SET DEFAULT 'ecpay';

-- Support idempotency and lookups.
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_merchant_trade_no_unique
  ON payments(provider, merchant_trade_no)
  WHERE merchant_trade_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_trade_no_unique
  ON payments(provider, trade_no)
  WHERE trade_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_order_id_created_at_desc_idx
  ON payments(order_id, created_at DESC);

-- ------------------------------------------------------------------
-- payment_events: additive provider/order/trade dimensions
-- ------------------------------------------------------------------
ALTER TABLE payment_events
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'ecpay',
  ADD COLUMN IF NOT EXISTS merchant_trade_no text;

-- Extend event types for callback/reconcile/reversal timeline.
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
      'callback_paid',
      'provider_reconciled_paid',
      'failed',
      'refunded',
      'authorization_voided',
      'cancelled',
      'additional_payment',
      'reversal_blocked',
      'reversal_incident'
    )
  );

-- Backfill additive fields where possible without destructive assumptions.
UPDATE payment_events pe
SET
  provider = COALESCE(NULLIF(pe.provider, ''), p.provider, 'ecpay'),
  merchant_trade_no = COALESCE(pe.merchant_trade_no, p.merchant_trade_no),
  trade_no = COALESCE(pe.trade_no, p.trade_no),
  order_id = COALESCE(pe.order_id, p.order_id)
FROM payments p
WHERE pe.payment_id = p.id
  AND (
    pe.provider IS NULL OR pe.provider = ''
    OR pe.merchant_trade_no IS NULL
    OR pe.trade_no IS NULL
    OR pe.order_id IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_payment_events_provider ON payment_events(provider);
CREATE INDEX IF NOT EXISTS idx_payment_events_merchant_trade_no
  ON payment_events(merchant_trade_no) WHERE merchant_trade_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_events_order_created_at_desc
  ON payment_events(order_id, created_at DESC);

-- Duplicate guard for idempotent provider-state events only.
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event_idempotent_unique
  ON payment_events(
    provider,
    event_type,
    order_id,
    COALESCE(merchant_trade_no, ''),
    COALESCE(trade_no, '')
  )
  WHERE event_type IN (
    'callback_paid',
    'provider_reconciled_paid',
    'authorization_voided',
    'refunded'
  );

-- ------------------------------------------------------------------
-- RLS/grants hardening: service-role path only
-- ------------------------------------------------------------------
ALTER TABLE IF EXISTS payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments: service role full access" ON payments;
DROP POLICY IF EXISTS "allow all payments" ON payments;
DROP POLICY IF EXISTS "payments policy" ON payments;
DROP POLICY IF EXISTS "payments: service_role only" ON payments;
CREATE POLICY "payments: service_role only" ON payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "payment_events: service role full access" ON payment_events;
DROP POLICY IF EXISTS "allow all payment_events" ON payment_events;
DROP POLICY IF EXISTS "payment_events policy" ON payment_events;
DROP POLICY IF EXISTS "payment_events: service_role only" ON payment_events;
CREATE POLICY "payment_events: service_role only" ON payment_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE payments FROM anon, authenticated, public;
REVOKE ALL ON TABLE payment_events FROM anon, authenticated, public;
GRANT ALL ON TABLE payments TO service_role;
GRANT ALL ON TABLE payment_events TO service_role;

-- ------------------------------------------------------------------
-- Callback contract extension (additive signature)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_process_payment_callback_atomic(
  p_order_id uuid,
  p_trade_no text DEFAULT NULL,
  p_owner_email text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT NULL,
  p_merchant_trade_no text DEFAULT NULL,
  p_provider text DEFAULT 'ecpay'
)
RETURNS TABLE (
  order_id uuid,
  order_status text,
  total_twd integer,
  paid_at timestamptz,
  schedule_id uuid,
  schedule_status text,
  schedule_booked_count integer,
  schedule_capacity integer,
  schedule_updated boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_schedule record;
  v_booking bookings%ROWTYPE;
  v_target_payment_id uuid;
  v_now timestamptz := now();
  v_book_result jsonb;
  v_origin_source_channel text;
  v_correlation_id text;
  v_provider text := lower(coalesce(nullif(btrim(p_provider), ''), 'ecpay'));
  v_trade_no text := nullif(btrim(p_trade_no), '');
  v_merchant_trade_no text := nullif(btrim(p_merchant_trade_no), '');
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'orderId is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_owner_email IS NOT NULL
     AND btrim(p_owner_email) <> ''
     AND lower(coalesce(v_order.contact_email, '')) <> lower(btrim(p_owner_email)) THEN
    RAISE EXCEPTION 'order ownership validation failed' USING ERRCODE = '28000';
  END IF;

  IF v_merchant_trade_no IS NOT NULL THEN
    SELECT pay.id
    INTO v_target_payment_id
    FROM payments pay
    WHERE pay.order_id = v_order.id
      AND coalesce(nullif(pay.provider, ''), 'ecpay') = v_provider
      AND pay.merchant_trade_no = v_merchant_trade_no
    ORDER BY pay.created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_target_payment_id IS NULL AND v_trade_no IS NOT NULL THEN
    SELECT pay.id
    INTO v_target_payment_id
    FROM payments pay
    WHERE pay.order_id = v_order.id
      AND coalesce(nullif(pay.provider, ''), 'ecpay') = v_provider
      AND pay.trade_no = v_trade_no
    ORDER BY pay.created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_target_payment_id IS NULL
     AND v_merchant_trade_no IS NULL
     AND v_trade_no IS NULL THEN
    SELECT pay.id
    INTO v_target_payment_id
    FROM payments pay
    WHERE pay.order_id = v_order.id
      AND coalesce(nullif(pay.provider, ''), 'ecpay') = v_provider
    ORDER BY pay.created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_order.booking_id IS NOT NULL THEN
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = v_order.booking_id
    FOR UPDATE;

    IF FOUND AND v_booking.status = 'draft' THEN
      UPDATE bookings
      SET status = 'pending_confirmation',
          updated_at = now()
      WHERE id = v_booking.id
        AND status = 'draft';

    IF FOUND THEN
      SELECT coalesce(
        nullif(v_booking.source_channel, ''),
        nullif(v_order.source_channel, ''),
        (
          SELECT nullif(bsl.metadata->>'sourceChannel', '')
          FROM booking_status_logs bsl
          WHERE bsl.booking_id = v_booking.id
            AND bsl.metadata ? 'sourceChannel'
          ORDER BY bsl.created_at ASC
          LIMIT 1
        ),
        'web'
      ) INTO v_origin_source_channel;

      SELECT coalesce(
        (
          SELECT nullif(bsl.metadata->>'correlationId', '')
          FROM booking_status_logs bsl
          WHERE bsl.booking_id = v_booking.id
            AND bsl.metadata ? 'correlationId'
          ORDER BY bsl.created_at ASC
          LIMIT 1
        ),
        (
          SELECT nullif(pe.payload->>'correlationId', '')
          FROM payments pay
          JOIN payment_events pe ON pe.payment_id = pay.id
          WHERE pay.order_id = v_order.id
            AND pe.payload ? 'correlationId'
          ORDER BY pe.created_at ASC
          LIMIT 1
        )
      ) INTO v_correlation_id;

      INSERT INTO booking_status_logs(
        booking_id,
        from_status,
        to_status,
        actor_role,
        reason,
        metadata
      )
      SELECT
        v_booking.id,
        'draft',
        'pending_confirmation',
        'system',
        'Payment callback received',
        jsonb_build_object(
          'orderId', v_order.id,
          'tradeNo', v_trade_no,
          'merchantTradeNo', v_merchant_trade_no,
          'provider', v_provider,
          'source', 'fn_process_payment_callback_atomic',
          'sourceChannel', v_origin_source_channel,
          'originSourceChannel', v_origin_source_channel,
          'correlationId', v_correlation_id,
          'auditSignal', CASE
            WHEN v_origin_source_channel = 'line' THEN 'line_liff_payment_callback_status_transition'
            ELSE 'payment_callback_status_transition'
          END
        )
      WHERE NOT EXISTS (
        SELECT 1
        FROM booking_status_logs bsl
        WHERE bsl.booking_id = v_booking.id
          AND bsl.to_status = 'pending_confirmation'
          AND bsl.actor_role = 'system'
          AND coalesce(bsl.metadata->>'orderId', '') = v_order.id::text
      );
    END IF;
    END IF;
  END IF;

  IF v_order.status IN ('paid', 'confirmed', 'completed') THEN
    UPDATE orders
    SET payment_status = 'paid',
        paid_at = coalesce(orders.paid_at, v_now),
        updated_at = now()
    WHERE id = v_order.id
      AND coalesce(payment_status, 'pending') <> 'paid';

    UPDATE payments pay
    SET trade_no = coalesce(pay.trade_no, v_trade_no),
        merchant_trade_no = coalesce(pay.merchant_trade_no, v_merchant_trade_no),
        raw_payload = coalesce(p_raw_payload, pay.raw_payload),
        status = 'paid',
        provider = coalesce(nullif(pay.provider, ''), v_provider),
        provider_status = coalesce(pay.provider_status, 'paid'),
        paid_at = coalesce(pay.paid_at, v_order.paid_at, v_now),
        updated_at = now()
    WHERE pay.id = v_target_payment_id;

    IF NOT FOUND THEN
      INSERT INTO payments(order_id, provider, merchant_trade_no, trade_no, amount_twd, currency, status, provider_status, captured_amount_twd, paid_at, raw_payload)
      VALUES(v_order.id, v_provider, v_merchant_trade_no, v_trade_no, coalesce(v_order.total_twd, 0), 'TWD', 'paid', 'paid', coalesce(v_order.total_twd, 0), coalesce(v_order.paid_at, v_now), p_raw_payload);
    END IF;

    RETURN QUERY
      SELECT
        v_order.id,
        v_order.status,
        v_order.total_twd,
        coalesce(v_order.paid_at, v_now),
        v_order.schedule_id,
        s.status,
        s.booked_count,
        s.capacity,
        false
      FROM activity_schedules s
      WHERE s.id = v_order.schedule_id;
    RETURN;
  END IF;

  IF v_order.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'illegal order status transition in callback: % -> paid', v_order.status USING ERRCODE = '22000';
  END IF;

  SELECT fn_book_schedule(v_order.schedule_id, v_order.people_count) INTO v_book_result;

  IF coalesce((v_book_result->>'ok')::boolean, false) = false THEN
    RAISE EXCEPTION 'booking_failed: % (remaining=%)',
      coalesce(v_book_result->>'error', 'booking_failed'),
      coalesce(v_book_result->>'remaining', '0')
      USING ERRCODE = '40001';
  END IF;

  UPDATE orders
  SET status = 'paid',
      payment_status = 'paid',
      paid_at = v_now,
      updated_at = now()
  WHERE id = v_order.id
    AND status = 'pending_payment';

  UPDATE payments pay
  SET status = 'paid',
      provider = coalesce(nullif(pay.provider, ''), v_provider),
      provider_status = coalesce(pay.provider_status, 'paid'),
      paid_at = coalesce(pay.paid_at, v_now),
      trade_no = coalesce(pay.trade_no, v_trade_no),
      merchant_trade_no = coalesce(pay.merchant_trade_no, v_merchant_trade_no),
      currency = coalesce(pay.currency, 'TWD'),
      captured_amount_twd = CASE
        WHEN coalesce(pay.captured_amount_twd, 0) > 0 THEN pay.captured_amount_twd
        ELSE coalesce(v_order.total_twd, 0)
      END,
      raw_payload = coalesce(p_raw_payload, pay.raw_payload),
      updated_at = now()
  WHERE pay.id = v_target_payment_id;

  IF NOT FOUND THEN
    INSERT INTO payments(order_id, provider, merchant_trade_no, trade_no, amount_twd, currency, status, provider_status, captured_amount_twd, paid_at, raw_payload)
    VALUES(v_order.id, v_provider, v_merchant_trade_no, v_trade_no, coalesce(v_order.total_twd, 0), 'TWD', 'paid', 'paid', coalesce(v_order.total_twd, 0), v_now, p_raw_payload);
  END IF;

  SELECT id, status, booked_count, capacity
  INTO v_schedule
  FROM activity_schedules
  WHERE id = v_order.schedule_id;

  RETURN QUERY
    SELECT
      v_order.id,
      'paid'::text,
      v_order.total_twd,
      v_now,
      v_order.schedule_id,
      v_schedule.status,
      v_schedule.booked_count,
      v_schedule.capacity,
      true;
END;
$$;

COMMIT;
