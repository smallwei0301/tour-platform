-- issue #191: payment callback audit semantics (success + replay)
-- keep atomicity in DB function fn_process_payment_callback_atomic(...)

CREATE OR REPLACE FUNCTION fn_process_payment_callback_atomic(
  p_order_id uuid,
  p_trade_no text DEFAULT NULL,
  p_owner_email text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT NULL
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
  v_now timestamptz := now();
  v_book_result jsonb;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'orderId is required' USING ERRCODE = '22023';
  END IF;

  -- row lock to serialize same-order callbacks
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

  -- idempotent replay path
  IF v_order.status IN ('paid', 'confirmed', 'completed') THEN
    INSERT INTO payments(order_id, provider, trade_no, amount_twd, status, paid_at, raw_payload)
    VALUES(v_order.id, 'ecpay', nullif(btrim(p_trade_no), ''), coalesce(v_order.total_twd, 0), 'paid', coalesce(v_order.paid_at, v_now), p_raw_payload)
    ON CONFLICT (order_id) DO UPDATE SET
      trade_no = coalesce(payments.trade_no, excluded.trade_no),
      raw_payload = coalesce(excluded.raw_payload, payments.raw_payload),
      updated_at = now();

    INSERT INTO audit_logs(order_id, actor, action, metadata)
    VALUES (
      v_order.id,
      'system',
      'payment_callback_replay_noop',
      jsonb_build_object(
        'event_type', 'payment_callback_replay_noop',
        'source', 'payment/ecpay_callback',
        'provider', 'ecpay',
        'order_id', v_order.id,
        'trade_no', nullif(btrim(p_trade_no), ''),
        'order_status', v_order.status,
        'callback_received_at', v_now
      )
    );

    RETURN QUERY
      SELECT
        v_order.id,
        v_order.status,
        v_order.total_twd,
        v_order.paid_at,
        v_order.schedule_id,
        s.status,
        s.booked_count,
        s.capacity,
        false
      FROM activity_schedules s
      WHERE s.id = v_order.schedule_id;
    RETURN;
  END IF;

  -- legal one-way transition guard for callback path
  IF v_order.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'illegal order status transition in callback: % -> paid', v_order.status USING ERRCODE = '22000';
  END IF;

  -- atomically reserve seats (internally uses row lock in fn_book_schedule)
  SELECT fn_book_schedule(v_order.schedule_id, v_order.people_count) INTO v_book_result;

  IF coalesce((v_book_result->>'ok')::boolean, false) = false THEN
    RAISE EXCEPTION 'booking_failed: % (remaining=%)',
      coalesce(v_book_result->>'error', 'booking_failed'),
      coalesce(v_book_result->>'remaining', '0')
      USING ERRCODE = '40001';
  END IF;

  UPDATE orders
  SET status = 'paid',
      paid_at = v_now,
      updated_at = now()
  WHERE id = v_order.id
    AND status = 'pending_payment';

  INSERT INTO payments(order_id, provider, trade_no, amount_twd, status, paid_at, raw_payload)
  VALUES(v_order.id, 'ecpay', nullif(btrim(p_trade_no), ''), coalesce(v_order.total_twd, 0), 'paid', v_now, p_raw_payload)
  ON CONFLICT (order_id) DO UPDATE SET
    status = 'paid',
    paid_at = coalesce(payments.paid_at, excluded.paid_at),
    trade_no = coalesce(payments.trade_no, excluded.trade_no),
    raw_payload = coalesce(excluded.raw_payload, payments.raw_payload),
    updated_at = now();

  INSERT INTO audit_logs(order_id, actor, action, metadata)
  VALUES (
    v_order.id,
    'system',
    'payment_callback_succeeded',
    jsonb_build_object(
      'event_type', 'payment_callback_succeeded',
      'source', 'payment/ecpay_callback',
      'provider', 'ecpay',
      'order_id', v_order.id,
      'trade_no', nullif(btrim(p_trade_no), ''),
      'order_status_before', 'pending_payment',
      'order_status_after', 'paid',
      'callback_received_at', v_now
    )
  );

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
