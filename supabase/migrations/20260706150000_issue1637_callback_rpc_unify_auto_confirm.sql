-- #1637 P0-1/P0-2/P1-1 — callback RPC 收斂為單一 6-arg 版本：
--   (a) DROP 4-arg overload（#195→20260624130000 系譜）。db.mjs processPaymentCallbackDb
--       以 6 個具名參數呼叫，PostgREST 永遠解析到 6-arg 版——4-arg 版是從未被生產呼叫的
--       死 overload，且 20260624130000 的 booking_type auto-confirm 因此從未生效（P0-2）。
--   (b) 6-arg 版納入 booking_type auto-confirm（20260624130000 的 owner 拍板決策：
--       instant/scheduled/request → booking draft → confirmed；未知/NULL → pending_confirmation）。
--   (c) order 終態隨 booking_type 走：可 auto-confirm 者付款後 order 直接 `confirmed`，
--       接上 #1554 auto-complete sweep 與掃碼核銷（兩者都只認 confirmed）——修復
--       「訂單卡 paid 永不結算」（P0-1，owner 2026-07-06 拍板）。無 booking／未知
--       booking_type 者維持 `paid`（admin POS 等人工流程照舊手動確認）。
--   (d) 金額驗證（P1-1）：p_raw_payload 帶 TradeAmt 時必須等於 orders.total_twd，
--       不符 RAISE EXCEPTION（ERRCODE 22000）整筆回滾——callback 層記 incident。
-- 原子序不變：鎖 orders → 鎖 bookings → replay 冪等 → 非法轉移守門 → 金額驗證
-- → fn_book_schedule 扣位 → 轉態。回滾：同名 .rollback.sql（還原 614 6-arg＋#195 4-arg）。

DROP FUNCTION IF EXISTS fn_process_payment_callback_atomic(uuid, text, text, jsonb);

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
  v_booking_type text;
  v_target_status text := 'pending_confirmation';
  v_order_final_status text := 'paid';
  v_trade_amt text;
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

  -- booking loop closure（鎖序 orders → bookings）：booking_type 一律先解析——
  -- 它同時決定 booking 轉態（draft 時）與 order 終態（fresh payment 時）。
  IF v_order.booking_id IS NOT NULL THEN
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = v_order.booking_id
    FOR UPDATE;

    IF FOUND THEN
      v_booking_type := NULL;
      IF v_booking.activity_plan_id IS NOT NULL THEN
        SELECT ap.booking_type INTO v_booking_type
        FROM activity_plans ap
        WHERE ap.id = v_booking.activity_plan_id;
      END IF;

      IF v_booking_type IN ('instant', 'scheduled', 'request') THEN
        v_target_status := 'confirmed';
        v_order_final_status := 'confirmed';
      ELSE
        v_target_status := 'pending_confirmation';
        v_order_final_status := 'paid';
      END IF;

      IF v_booking.status = 'draft' THEN
        UPDATE bookings
        SET status = v_target_status,
            confirmed_at = CASE WHEN v_target_status = 'confirmed' THEN coalesce(confirmed_at, now()) ELSE confirmed_at END,
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
            v_target_status,
            'system',
            'Payment callback received',
            jsonb_build_object(
              'orderId', v_order.id,
              'tradeNo', v_trade_no,
              'merchantTradeNo', v_merchant_trade_no,
              'provider', v_provider,
              'bookingType', v_booking_type,
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
              AND bsl.to_status = v_target_status
              AND bsl.actor_role = 'system'
              AND coalesce(bsl.metadata->>'orderId', '') = v_order.id::text
          );
        END IF;
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

  -- #1637 P1-1 金額驗證：provider 回報 TradeAmt 時必須等於訂單金額；
  -- 不符整筆回滾（不扣位、不轉態），callback 層據此記 incident 且不回 1|OK。
  v_trade_amt := nullif(btrim(coalesce(p_raw_payload->>'TradeAmt', '')), '');
  IF v_trade_amt IS NOT NULL AND v_trade_amt ~ '^[0-9]+$' THEN
    IF v_trade_amt::bigint <> coalesce(v_order.total_twd, 0)::bigint THEN
      RAISE EXCEPTION 'payment amount mismatch: TradeAmt=% expected total_twd=%',
        v_trade_amt, coalesce(v_order.total_twd, 0)
        USING ERRCODE = '22000';
    END IF;
  END IF;

  SELECT fn_book_schedule(v_order.schedule_id, v_order.people_count) INTO v_book_result;

  IF coalesce((v_book_result->>'ok')::boolean, false) = false THEN
    RAISE EXCEPTION 'booking_failed: % (remaining=%)',
      coalesce(v_book_result->>'error', 'booking_failed'),
      coalesce(v_book_result->>'remaining', '0')
      USING ERRCODE = '40001';
  END IF;

  UPDATE orders
  SET status = v_order_final_status,
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
      v_order_final_status,
      v_order.total_twd,
      v_now,
      v_order.schedule_id,
      v_schedule.status,
      v_schedule.booked_count,
      v_schedule.capacity,
      true;
END;
$$;
