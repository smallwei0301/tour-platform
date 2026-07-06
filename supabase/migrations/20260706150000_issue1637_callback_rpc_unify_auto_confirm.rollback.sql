-- Rollback for 20260706150000_issue1637_callback_rpc_unify_auto_confirm.sql
-- 還原至套用前的生產狀態：6-arg 版還原為 20260519120000（issue614）版本、
-- 重建 4-arg overload（20260423194000 issue195 版本，即 20260624130000.rollback 所還原者）。

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
  v_booking bookings%ROWTYPE;
  v_now timestamptz := now();
  v_book_result jsonb;
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
            'tradeNo', nullif(btrim(p_trade_no), ''),
            'source', 'fn_process_payment_callback_atomic'
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
    UPDATE payments pay
    SET trade_no = coalesce(pay.trade_no, nullif(btrim(p_trade_no), '')),
        raw_payload = coalesce(p_raw_payload, pay.raw_payload),
        updated_at = now()
    WHERE pay.order_id = v_order.id;

    IF NOT FOUND THEN
      INSERT INTO payments(order_id, provider, trade_no, amount_twd, status, paid_at, raw_payload)
      VALUES(v_order.id, 'ecpay', nullif(btrim(p_trade_no), ''), coalesce(v_order.total_twd, 0), 'paid', coalesce(v_order.paid_at, v_now), p_raw_payload);
    END IF;

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
      paid_at = v_now,
      updated_at = now()
  WHERE id = v_order.id
    AND status = 'pending_payment';

  UPDATE payments pay
  SET status = 'paid',
      paid_at = coalesce(pay.paid_at, v_now),
      trade_no = coalesce(pay.trade_no, nullif(btrim(p_trade_no), '')),
      raw_payload = coalesce(p_raw_payload, pay.raw_payload),
      updated_at = now()
  WHERE pay.order_id = v_order.id;

  IF NOT FOUND THEN
    INSERT INTO payments(order_id, provider, trade_no, amount_twd, status, paid_at, raw_payload)
    VALUES(v_order.id, 'ecpay', nullif(btrim(p_trade_no), ''), coalesce(v_order.total_twd, 0), 'paid', v_now, p_raw_payload);
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
