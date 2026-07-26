--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Debian 17.10-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.booking_status AS ENUM (
    'pending',
    'confirmed',
    'cancelled',
    'completed',
    'no_show'
);


ALTER TYPE public.booking_status OWNER TO postgres;

--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.payment_method AS ENUM (
    'credit_card',
    'atm',
    'cvs',
    'barcode',
    'ecpay'
);


ALTER TYPE public.payment_method OWNER TO postgres;

--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'refunded',
    'cancelled'
);


ALTER TYPE public.payment_status OWNER TO postgres;

--
-- Name: fn_auto_full_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_auto_full_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.booked_count >= NEW.capacity AND NEW.status = 'open' THEN
    NEW.status := 'full';
  END IF;
  -- 如果手動減少了 booked_count，且還有空位，恢復 open
  IF NEW.booked_count < NEW.capacity AND NEW.status = 'full' THEN
    NEW.status := 'open';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_auto_full_status() OWNER TO postgres;

--
-- Name: fn_book_schedule(uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_book_schedule(p_schedule_id uuid, p_count integer DEFAULT 1) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_schedule activity_schedules%ROWTYPE;
  v_remaining integer;
BEGIN
  -- 鎖定該場次避免併發超賣
  SELECT * INTO v_schedule
    FROM activity_schedules
    WHERE id = p_schedule_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'schedule_not_found');
  END IF;

  IF v_schedule.status != 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'schedule_not_open', 'status', v_schedule.status);
  END IF;

  v_remaining := v_schedule.capacity - v_schedule.booked_count;
  IF p_count > v_remaining THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_capacity',
      'remaining', v_remaining, 'requested', p_count);
  END IF;

  UPDATE activity_schedules
    SET booked_count = booked_count + p_count
    WHERE id = p_schedule_id;

  RETURN jsonb_build_object('ok', true,
    'booked_count', v_schedule.booked_count + p_count,
    'remaining', v_remaining - p_count);
END;
$$;


ALTER FUNCTION public.fn_book_schedule(p_schedule_id uuid, p_count integer) OWNER TO postgres;

--
-- Name: fn_cancel_booking(uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_cancel_booking(p_schedule_id uuid, p_count integer DEFAULT 1) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_schedule activity_schedules%ROWTYPE;
BEGIN
  SELECT * INTO v_schedule
    FROM activity_schedules
    WHERE id = p_schedule_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'schedule_not_found');
  END IF;

  IF v_schedule.booked_count < p_count THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_cancel_count');
  END IF;

  UPDATE activity_schedules
    SET booked_count = booked_count - p_count
    WHERE id = p_schedule_id;

  RETURN jsonb_build_object('ok', true,
    'booked_count', v_schedule.booked_count - p_count,
    'remaining', v_schedule.capacity - v_schedule.booked_count + p_count);
END;
$$;


ALTER FUNCTION public.fn_cancel_booking(p_schedule_id uuid, p_count integer) OWNER TO postgres;

--
-- Name: fn_create_external_hold(uuid, integer, uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_create_external_hold(p_schedule_id uuid, p_count integer, p_guide_id uuid, p_activity_plan_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_actor_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_schedule activity_schedules%ROWTYPE;
  v_activity_guide_id uuid;
  v_book_result jsonb;
  v_booking_id uuid;
BEGIN
  IF p_count IS NULL OR p_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_count');
  END IF;

  -- a. 鎖定場次（與 fn_book_schedule 同一把行鎖序：activity_schedules）
  SELECT * INTO v_schedule
    FROM activity_schedules
    WHERE id = p_schedule_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'schedule_not_found');
  END IF;

  -- b. ownership 驗證（DB 端再驗一次，與 API 端形成 defense-in-depth）
  SELECT guide_id INTO v_activity_guide_id
    FROM activities
    WHERE id = v_schedule.activity_id;

  IF v_activity_guide_id IS NULL OR v_activity_guide_id <> p_guide_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- c. 原子扣量（schedule_not_open / insufficient_capacity 直接回傳，不建立 booking）
  v_book_result := fn_book_schedule(p_schedule_id, p_count);
  IF NOT COALESCE((v_book_result->>'ok')::boolean, false) THEN
    RETURN v_book_result;
  END IF;

  -- d. 建立外部佔位 booking（booking_no 由 trigger 產生；timezone 取 schedule 預設）
  INSERT INTO bookings (
    traveler_id, guide_id, activity_id, activity_plan_id, schedule_id,
    source_channel, start_at, end_at, participants, status, internal_note
  ) VALUES (
    NULL, p_guide_id, v_schedule.activity_id, p_activity_plan_id, p_schedule_id,
    'external', v_schedule.start_at, v_schedule.end_at, p_count, 'external_hold', p_note
  )
  RETURNING id INTO v_booking_id;

  -- e. 稽核：external_hold 建立紀錄（guide 非 users 表成員，actor_user_id 留 NULL）
  INSERT INTO booking_status_logs (
    booking_id, from_status, to_status, actor_user_id, actor_role, reason, metadata
  ) VALUES (
    v_booking_id, NULL, 'external_hold', p_actor_user_id, 'guide', 'external_hold_created',
    jsonb_build_object('schedule_id', p_schedule_id, 'guide_id', p_guide_id, 'participants', p_count, 'note', p_note)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'booked_count', (v_book_result->>'booked_count')::integer,
    'remaining', (v_book_result->>'remaining')::integer
  );
END;
$$;


ALTER FUNCTION public.fn_create_external_hold(p_schedule_id uuid, p_count integer, p_guide_id uuid, p_activity_plan_id uuid, p_note text, p_actor_user_id uuid) OWNER TO postgres;

--
-- Name: fn_expire_unpaid_order_atomic(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_expire_unpaid_order_atomic(p_order_id uuid, p_now timestamp with time zone DEFAULT now()) RETURNS TABLE(order_id uuid, expired boolean, order_status text, booking_id uuid, booking_status text, schedule_id uuid, schedule_released boolean)
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_booking bookings%ROWTYPE;
  v_schedule_released boolean := false;
  v_book_result jsonb;
  v_booking_id uuid := NULL;
  v_booking_status text := NULL;
  v_schedule_id uuid := NULL;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'orderId is required' USING ERRCODE = '22023';
  END IF;

  -- 1) orders 鎖：序列化同單的 callback 與逾時取消。
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_order_id, false, NULL::text, NULL::uuid, NULL::text, NULL::uuid, false;
    RETURN;
  END IF;

  -- 冪等守門：非 pending_payment、無截止時間、或尚未到期 → noop。
  IF v_order.status <> 'pending_payment'
     OR v_order.payment_deadline_at IS NULL
     OR v_order.payment_deadline_at > p_now THEN
    RETURN QUERY SELECT p_order_id, false, v_order.status, v_order.booking_id, NULL::text, NULL::uuid, false;
    RETURN;
  END IF;

  -- 2) bookings 鎖 + 取消（draft / pending_confirmation 才動），釋出 V2 動態容量
  --    （capacity hold 以 booking 狀態計，改 cancelled 即釋出）。
  IF v_order.booking_id IS NOT NULL THEN
    SELECT * INTO v_booking FROM bookings WHERE id = v_order.booking_id FOR UPDATE;
    IF FOUND THEN
      v_booking_id := v_booking.id;
      v_schedule_id := v_booking.schedule_id;
      IF v_booking.status IN ('draft', 'pending_confirmation') THEN
        UPDATE bookings
          SET status = 'cancelled', cancelled_at = p_now, updated_at = p_now
          WHERE id = v_booking.id;
        v_booking_status := 'cancelled';

        INSERT INTO booking_status_logs (booking_id, from_status, to_status, actor_user_id, actor_role, reason, metadata)
        SELECT v_booking.id, v_booking.status, 'cancelled', NULL, 'system', 'payment_deadline_expired',
               jsonb_build_object('orderId', p_order_id, 'paymentDeadlineAt', v_order.payment_deadline_at)
        WHERE NOT EXISTS (
          SELECT 1 FROM booking_status_logs
          WHERE booking_id = v_booking.id AND to_status = 'cancelled' AND reason = 'payment_deadline_expired'
        );

        -- 3) activity_schedules：固定場次（有 schedule_id）回補 booked_count。
        IF v_booking.schedule_id IS NOT NULL THEN
          v_book_result := fn_cancel_booking(v_booking.schedule_id, v_booking.participants);
          v_schedule_released := coalesce((v_book_result->>'ok')::boolean, false);
        END IF;
      ELSE
        v_booking_status := v_booking.status;
      END IF;
    END IF;
  END IF;

  -- 4) order → cancelled_unpaid。
  UPDATE orders
    SET status = 'cancelled_unpaid', updated_at = p_now
    WHERE id = p_order_id;

  RETURN QUERY SELECT p_order_id, true, 'cancelled_unpaid'::text, v_booking_id, v_booking_status, v_schedule_id, v_schedule_released;
END;
$$;


ALTER FUNCTION public.fn_expire_unpaid_order_atomic(p_order_id uuid, p_now timestamp with time zone) OWNER TO postgres;

--
-- Name: fn_process_payment_callback_atomic(uuid, text, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_process_payment_callback_atomic(p_order_id uuid, p_trade_no text DEFAULT NULL::text, p_owner_email text DEFAULT NULL::text, p_raw_payload jsonb DEFAULT NULL::jsonb, p_merchant_trade_no text DEFAULT NULL::text, p_provider text DEFAULT 'ecpay'::text) RETURNS TABLE(order_id uuid, order_status text, total_twd integer, paid_at timestamp with time zone, schedule_id uuid, schedule_status text, schedule_booked_count integer, schedule_capacity integer, schedule_updated boolean)
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION public.fn_process_payment_callback_atomic(p_order_id uuid, p_trade_no text, p_owner_email text, p_raw_payload jsonb, p_merchant_trade_no text, p_provider text) OWNER TO postgres;

--
-- Name: fn_redeem_promo_code(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_redeem_promo_code(p_code text, p_user_id uuid, p_order_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_promo              public.promo_codes;
  v_user_redemptions   integer;
BEGIN
  -- Row-level lock to prevent concurrent double-redemption
  SELECT * INTO v_promo
    FROM public.promo_codes
    WHERE code = upper(trim(p_code))
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  END IF;

  IF NOT v_promo.active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'INACTIVE');
  END IF;

  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'EXPIRED');
  END IF;

  IF v_promo.used_count >= v_promo.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'EXHAUSTED');
  END IF;

  SELECT COUNT(*) INTO v_user_redemptions
    FROM public.promo_redemptions
    WHERE user_id = p_user_id AND promo_code_id = v_promo.id;

  IF v_user_redemptions >= v_promo.per_user_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ALREADY_REDEEMED');
  END IF;

  -- Atomic increment
  UPDATE public.promo_codes
    SET used_count = used_count + 1
    WHERE id = v_promo.id;

  -- Record redemption
  INSERT INTO public.promo_redemptions (user_id, promo_code_id, order_id)
    VALUES (p_user_id, v_promo.id, p_order_id);

  RETURN jsonb_build_object(
    'ok',            true,
    'promo_code_id', v_promo.id,
    'discount_type', v_promo.discount_type,
    'discount_value', v_promo.discount_value
  );
END $$;


ALTER FUNCTION public.fn_redeem_promo_code(p_code text, p_user_id uuid, p_order_id uuid) OWNER TO postgres;

--
-- Name: fn_refresh_activity_availability_daily(uuid, date, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_refresh_activity_availability_daily(p_activity_id uuid, p_date_from date DEFAULT CURRENT_DATE, p_date_to date DEFAULT ((CURRENT_DATE + '90 days'::interval))::date) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_deleted integer := 0;
  v_inserted integer := 0;
BEGIN
  IF p_activity_id IS NULL THEN
    RAISE EXCEPTION 'p_activity_id is required';
  END IF;

  DELETE FROM activity_availability_daily
   WHERE activity_id = p_activity_id
     AND date BETWEEN p_date_from AND p_date_to;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  WITH base AS (
    SELECT
      s.activity_id,
      (s.start_at AT TIME ZONE 'Asia/Taipei')::date AS date,
      NULLIF(btrim(s.plan_id), '') AS plan_id,
      GREATEST(COALESCE(s.capacity, 0), 0) AS capacity,
      GREATEST(COALESCE(s.booked_count, 0), 0) AS booked,
      COALESCE(s.status, 'open') AS status
    FROM activity_schedules s
    WHERE s.activity_id = p_activity_id
      AND (s.start_at AT TIME ZONE 'Asia/Taipei')::date BETWEEN p_date_from AND p_date_to
  ),
  by_plan AS (
    SELECT
      activity_id,
      date,
      plan_id,
      SUM(capacity)::int AS total_capacity,
      SUM(booked)::int AS total_booked,
      GREATEST(SUM(capacity) - SUM(booked), 0)::int AS remaining,
      BOOL_OR(status = 'open') AND (SUM(capacity) - SUM(booked) > 0) AS is_open
    FROM base
    WHERE plan_id IS NOT NULL
    GROUP BY activity_id, date, plan_id
  ),
  all_plan AS (
    SELECT
      activity_id,
      date,
      NULL::text AS plan_id,
      SUM(capacity)::int AS total_capacity,
      SUM(booked)::int AS total_booked,
      GREATEST(SUM(capacity) - SUM(booked), 0)::int AS remaining,
      BOOL_OR(status = 'open') AND (SUM(capacity) - SUM(booked) > 0) AS is_open
    FROM base
    GROUP BY activity_id, date
  )
  INSERT INTO activity_availability_daily(activity_id, date, plan_id, total_capacity, total_booked, remaining, is_open, updated_at)
  SELECT activity_id, date, plan_id, total_capacity, total_booked, remaining, is_open, now() FROM by_plan
  UNION ALL
  SELECT activity_id, date, plan_id, total_capacity, total_booked, remaining, is_open, now() FROM all_plan;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;


ALTER FUNCTION public.fn_refresh_activity_availability_daily(p_activity_id uuid, p_date_from date, p_date_to date) OWNER TO postgres;

--
-- Name: fn_refresh_activity_availability_daily_by_schedule_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_refresh_activity_availability_daily_by_schedule_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_activity_id uuid;
  v_date_from date;
  v_date_to date;
BEGIN
  v_activity_id := COALESCE(NEW.activity_id, OLD.activity_id);
  v_date_from := LEAST(
    COALESCE((NEW.start_at AT TIME ZONE 'Asia/Taipei')::date, CURRENT_DATE),
    COALESCE((OLD.start_at AT TIME ZONE 'Asia/Taipei')::date, CURRENT_DATE)
  );
  v_date_to := GREATEST(
    COALESCE((NEW.start_at AT TIME ZONE 'Asia/Taipei')::date, CURRENT_DATE),
    COALESCE((OLD.start_at AT TIME ZONE 'Asia/Taipei')::date, CURRENT_DATE)
  );

  PERFORM fn_refresh_activity_availability_daily(v_activity_id, v_date_from, v_date_to);
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION public.fn_refresh_activity_availability_daily_by_schedule_change() OWNER TO postgres;

--
-- Name: fn_release_external_hold(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_release_external_hold(p_booking_id uuid, p_guide_id uuid, p_actor_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_cancel_result jsonb;
BEGIN
  SELECT * INTO v_booking
    FROM bookings
    WHERE id = p_booking_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'hold_not_found');
  END IF;

  IF v_booking.status <> 'external_hold' OR v_booking.source_channel <> 'external' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_external_hold');
  END IF;

  IF v_booking.guide_id <> p_guide_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- 退還座位（schedule_id 理應非空；缺漏時不阻擋 booking 釋放，回傳供觀測）
  IF v_booking.schedule_id IS NOT NULL THEN
    v_cancel_result := fn_cancel_booking(v_booking.schedule_id, v_booking.participants);
  ELSE
    v_cancel_result := jsonb_build_object('ok', false, 'error', 'missing_schedule_id');
  END IF;

  UPDATE bookings
    SET status = 'cancelled', cancelled_at = now()
    WHERE id = p_booking_id;

  INSERT INTO booking_status_logs (
    booking_id, from_status, to_status, actor_user_id, actor_role, reason, metadata
  ) VALUES (
    p_booking_id, 'external_hold', 'cancelled', p_actor_user_id, 'guide', 'external_hold_released',
    jsonb_build_object('schedule_id', v_booking.schedule_id, 'guide_id', p_guide_id,
                       'participants', v_booking.participants, 'cancel_result', v_cancel_result)
  );

  RETURN jsonb_build_object('ok', true, 'booking_id', p_booking_id, 'cancel', v_cancel_result);
END;
$$;


ALTER FUNCTION public.fn_release_external_hold(p_booking_id uuid, p_guide_id uuid, p_actor_user_id uuid) OWNER TO postgres;

--
-- Name: fn_reschedule_booking_atomic(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_reschedule_booking_atomic(p_request_id uuid, p_resolver text DEFAULT 'guide'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_req       reschedule_requests%ROWTYPE;
  v_order     orders%ROWTYPE;
  v_from      activity_schedules%ROWTYPE;
  v_to        activity_schedules%ROWTYPE;
  v_sched     activity_schedules%ROWTYPE;
  v_now       timestamptz := now();
BEGIN
  SELECT * INTO v_req
  FROM reschedule_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reschedule_failed: request_not_found' USING ERRCODE = '22000';
  END IF;
  IF v_req.status <> 'requested' THEN
    RAISE EXCEPTION 'reschedule_failed: request_not_pending (%)', v_req.status USING ERRCODE = '22000';
  END IF;

  -- 鎖序 1/3：orders
  SELECT * INTO v_order
  FROM orders
  WHERE id = v_req.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reschedule_failed: order_not_found' USING ERRCODE = '22000';
  END IF;
  IF v_order.status <> 'reschedule_requested' THEN
    RAISE EXCEPTION 'reschedule_failed: order_not_in_reschedule (%)', v_order.status USING ERRCODE = '22000';
  END IF;

  -- 鎖序 2/3：bookings（如有對應 booking）
  IF v_order.booking_id IS NOT NULL THEN
    PERFORM 1 FROM bookings WHERE id = v_order.booking_id FOR UPDATE;
  END IF;

  -- 鎖序 3/3：activity_schedules — 兩場次依 id 排序鎖定，避免並發互等
  FOR v_sched IN
    SELECT * FROM activity_schedules
    WHERE id IN (v_req.from_schedule_id, v_req.to_schedule_id)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_sched.id = v_req.from_schedule_id THEN v_from := v_sched; END IF;
    IF v_sched.id = v_req.to_schedule_id  THEN v_to   := v_sched; END IF;
  END LOOP;

  IF v_to.id IS NULL THEN
    RAISE EXCEPTION 'reschedule_failed: target_schedule_not_found' USING ERRCODE = '22000';
  END IF;
  IF v_to.status <> 'open' THEN
    RAISE EXCEPTION 'reschedule_failed: slot_not_open' USING ERRCODE = '22000';
  END IF;
  IF v_to.capacity > 0 AND (v_to.capacity - v_to.booked_count) < v_order.people_count THEN
    RAISE EXCEPTION 'reschedule_failed: insufficient_capacity (remaining %, requested %)',
      v_to.capacity - v_to.booked_count, v_order.people_count USING ERRCODE = '22000';
  END IF;

  -- 先扣新、再補舊（失敗即整體回滾，不會雙重釋放）
  UPDATE activity_schedules
  SET booked_count = booked_count + v_order.people_count,
      status = CASE WHEN capacity > 0 AND booked_count + v_order.people_count >= capacity
                    THEN 'full' ELSE status END
  WHERE id = v_to.id;

  IF v_from.id IS NOT NULL THEN
    UPDATE activity_schedules
    SET booked_count = GREATEST(0, booked_count - v_order.people_count),
        status = CASE WHEN status = 'full' AND capacity > 0
                       AND GREATEST(0, booked_count - v_order.people_count) < capacity
                      THEN 'open' ELSE status END
    WHERE id = v_from.id;
  END IF;

  UPDATE orders
  SET schedule_id = v_to.id,
      status = v_req.prior_order_status,
      updated_at = v_now
  WHERE id = v_order.id;

  IF v_order.booking_id IS NOT NULL THEN
    UPDATE bookings
    SET start_at = v_to.start_at,
        end_at = v_to.end_at,
        updated_at = v_now
    WHERE id = v_order.booking_id;
  END IF;

  UPDATE reschedule_requests
  SET status = 'approved',
      resolver = p_resolver,
      resolved_at = v_now,
      updated_at = v_now
  WHERE id = v_req.id;

  INSERT INTO audit_logs (order_id, actor, action, metadata, created_at)
  VALUES (
    v_order.id,
    'guide',
    'reschedule_approved',
    jsonb_build_object(
      'rescheduleRequestId', v_req.id,
      'fromScheduleId', v_req.from_schedule_id,
      'toScheduleId', v_req.to_schedule_id,
      'fromStartAt', v_req.from_start_at,
      'toStartAt', v_req.to_start_at
    ),
    v_now
  );
END;
$$;


ALTER FUNCTION public.fn_reschedule_booking_atomic(p_request_id uuid, p_resolver text) OWNER TO postgres;

--
-- Name: fn_schedule_date(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_schedule_date(ts timestamp with time zone) RETURNS date
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT (ts AT TIME ZONE 'Asia/Taipei')::date;
$$;


ALTER FUNCTION public.fn_schedule_date(ts timestamp with time zone) OWNER TO postgres;

--
-- Name: generate_booking_no(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_booking_no() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  date_part text;
  seq_part text;
  count_today integer;
BEGIN
  date_part := to_char(now(), 'YYYYMMDD');

  -- Count bookings created today
  SELECT COUNT(*) + 1 INTO count_today
  FROM bookings
  WHERE created_at::date = now()::date;

  seq_part := lpad(count_today::text, 5, '0');
  NEW.booking_no := 'BK-' || date_part || '-' || seq_part;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_booking_no() OWNER TO postgres;

--
-- Name: handle_auth_user_sync(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_auth_user_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url, role)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    COALESCE(new.raw_user_meta_data->>'role', 'traveler')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now();
  RETURN new;
END;
$$;


ALTER FUNCTION public.handle_auth_user_sync() OWNER TO postgres;

--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION public.rls_auto_enable() OWNER TO postgres;

--
-- Name: rls_grants_preflight_check_grants(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rls_grants_preflight_check_grants(p_table text) RETURNS TABLE(grantee text, privilege_type text, is_grantable text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  with target_table as (
    select c.relname::text as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and p_table is not null
      and c.relname = p_table
  )
  select
    g.grantee::text,
    g.privilege_type::text,
    g.is_grantable::text
  from target_table t
  join information_schema.role_table_grants g
    on g.table_schema = 'public'
   and g.table_name = t.table_name
  order by g.grantee, g.privilege_type;
$$;


ALTER FUNCTION public.rls_grants_preflight_check_grants(p_table text) OWNER TO postgres;

--
-- Name: rls_grants_preflight_check_policies(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rls_grants_preflight_check_policies(p_table text) RETURNS TABLE(policyname text, roles text, cmd text, qual text, with_check text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  with target_table as (
    select c.relname::text as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and p_table is not null
      and c.relname = p_table
  )
  select
    p.policyname::text,
    p.roles::text,
    p.cmd::text,
    p.qual,
    p.with_check
  from target_table t
  join pg_policies p
    on p.schemaname = 'public'
   and p.tablename = t.table_name
  order by p.policyname;
$$;


ALTER FUNCTION public.rls_grants_preflight_check_policies(p_table text) OWNER TO postgres;

--
-- Name: rls_preflight_scan(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rls_preflight_scan() RETURNS TABLE(table_name text, rls_enabled boolean, forbidden_write_grantees text[])
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  select c.relname::text, c.relrowsecurity,
    coalesce((select array_agg(distinct g.grantee::text order by g.grantee::text)
      from information_schema.role_table_grants g
      where g.table_schema='public' and g.table_name=c.relname
        and g.privilege_type in ('INSERT','UPDATE','DELETE')
        and g.grantee in ('anon','authenticated','PUBLIC')), '{}'::text[])
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' order by c.relname;
$$;


ALTER FUNCTION public.rls_preflight_scan() OWNER TO postgres;

--
-- Name: set_activity_qa_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_activity_qa_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_activity_qa_updated_at() OWNER TO postgres;

--
-- Name: set_admin_security_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_admin_security_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_admin_security_updated_at() OWNER TO postgres;

--
-- Name: set_order_booking_no(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_order_booking_no() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.booking_no IS NULL THEN
    NEW.booking_no := nextval('orders_booking_no_seq');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_order_booking_no() OWNER TO postgres;

--
-- Name: set_payment_booking_mismatch_governance_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_payment_booking_mismatch_governance_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
  new.updated_at := now();
  return new;
end
$$;


ALTER FUNCTION public.set_payment_booking_mismatch_governance_updated_at() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guide_id uuid,
    guide_slug text,
    title text NOT NULL,
    slug text NOT NULL,
    tagline text,
    short_description text,
    description text,
    region text,
    region_slug text,
    category text,
    price_twd integer DEFAULT 0 NOT NULL,
    min_participants integer DEFAULT 1 NOT NULL,
    max_participants integer DEFAULT 10 NOT NULL,
    duration_minutes integer,
    meeting_point text,
    meeting_point_map_url text,
    cover_image_url text,
    image_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    inclusions jsonb DEFAULT '[]'::jsonb NOT NULL,
    exclusions jsonb DEFAULT '[]'::jsonb NOT NULL,
    notices jsonb DEFAULT '[]'::jsonb NOT NULL,
    refund_policy_type text DEFAULT 'standard'::text NOT NULL,
    refund_rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    safety_notice text,
    faq jsonb DEFAULT '[]'::jsonb NOT NULL,
    good_for jsonb DEFAULT '[]'::jsonb NOT NULL,
    not_good_for jsonb DEFAULT '[]'::jsonb NOT NULL,
    transport_mode text,
    seo_title text,
    seo_description text,
    status text DEFAULT 'draft'::text NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    plans jsonb,
    itinerary jsonb DEFAULT '[]'::jsonb NOT NULL,
    social_proof_quotes jsonb DEFAULT '[]'::jsonb NOT NULL,
    rating_avg numeric(3,2),
    review_count integer DEFAULT 0,
    review_state text,
    pending_changes jsonb,
    pending_submitted_by_guide_id uuid,
    pending_submitted_at timestamp with time zone,
    pending_base_updated_at timestamp with time zone,
    review_admin_note text,
    regions jsonb DEFAULT '[]'::jsonb NOT NULL,
    dismissal_point text,
    dismissal_point_map_url text,
    meeting_lat numeric(10,7),
    meeting_lng numeric(10,7),
    dismissal_lat numeric(10,7),
    dismissal_lng numeric(10,7),
    midao_status text,
    midao_deal_mode text DEFAULT 'confirm_first'::text NOT NULL,
    midao_questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    languages jsonb DEFAULT '[]'::jsonb NOT NULL,
    midao_sort_order integer,
    CONSTRAINT activities_midao_deal_mode_check CHECK ((midao_deal_mode = ANY (ARRAY['instant_booking'::text, 'confirm_first'::text, 'line_inquiry'::text]))),
    CONSTRAINT activities_midao_status_check CHECK ((midao_status = ANY (ARRAY['draft'::text, 'published'::text]))),
    CONSTRAINT activities_rating_avg_range CHECK (((rating_avg IS NULL) OR ((rating_avg >= (0)::numeric) AND (rating_avg <= (5)::numeric)))),
    CONSTRAINT activities_review_state_check CHECK (((review_state IS NULL) OR (review_state = ANY (ARRAY['pending'::text, 'changes_requested'::text])))),
    CONSTRAINT activities_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


ALTER TABLE public.activities OWNER TO postgres;

--
-- Name: COLUMN activities.regions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.activities.regions IS '附加地區（複選，DB 規範值如「高雄市」）。主要地區仍存於 region/region_slug 決定 URL/SEO；本欄讓行程在多個地區篩選中出現。';


--
-- Name: activity_addons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_addons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    name text NOT NULL,
    price_twd integer NOT NULL,
    unit text DEFAULT 'per_person'::text NOT NULL,
    stock integer,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_addons_price_twd_check CHECK ((price_twd >= 0)),
    CONSTRAINT activity_addons_unit_check CHECK ((unit = ANY (ARRAY['per_person'::text, 'per_group'::text])))
);


ALTER TABLE public.activity_addons OWNER TO postgres;

--
-- Name: activity_availability_daily; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_availability_daily (
    activity_id uuid NOT NULL,
    date date NOT NULL,
    plan_id text,
    total_capacity integer DEFAULT 0 NOT NULL,
    total_booked integer DEFAULT 0 NOT NULL,
    remaining integer DEFAULT 0 NOT NULL,
    is_open boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.activity_availability_daily OWNER TO postgres;

--
-- Name: activity_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    url text NOT NULL,
    alt text,
    kind text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_images_kind_check CHECK ((kind = ANY (ARRAY['cover'::text, 'gallery'::text])))
);


ALTER TABLE public.activity_images OWNER TO postgres;

--
-- Name: activity_packages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2),
    currency text DEFAULT 'TWD'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.activity_packages OWNER TO postgres;

--
-- Name: activity_plan_seasons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_plan_seasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_plan_id uuid NOT NULL,
    start_month integer NOT NULL,
    start_day integer NOT NULL,
    end_month integer NOT NULL,
    end_day integer NOT NULL,
    timezone text DEFAULT 'Asia/Taipei'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    CONSTRAINT activity_plan_seasons_end_day_check CHECK (((end_day >= 1) AND (end_day <= 31))),
    CONSTRAINT activity_plan_seasons_end_month_check CHECK (((end_month >= 1) AND (end_month <= 12))),
    CONSTRAINT activity_plan_seasons_start_day_check CHECK (((start_day >= 1) AND (start_day <= 31))),
    CONSTRAINT activity_plan_seasons_start_month_check CHECK (((start_month >= 1) AND (start_month <= 12)))
);


ALTER TABLE public.activity_plan_seasons OWNER TO postgres;

--
-- Name: activity_plan_tiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_plan_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    tier text NOT NULL,
    price_twd integer NOT NULL,
    multiplier numeric(4,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_plan_tiers_price_twd_check CHECK ((price_twd >= 0)),
    CONSTRAINT activity_plan_tiers_tier_check CHECK ((tier = ANY (ARRAY['adult'::text, 'child'::text, 'infant'::text])))
);


ALTER TABLE public.activity_plan_tiers OWNER TO postgres;

--
-- Name: activity_plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    duration_minutes integer NOT NULL,
    price_type text NOT NULL,
    base_price integer NOT NULL,
    min_participants integer DEFAULT 1 NOT NULL,
    max_participants integer NOT NULL,
    booking_type text DEFAULT 'instant'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_plan_id text,
    details_link_text text,
    booking_btn_text text,
    highlights jsonb,
    language text,
    earliest_departure text,
    confirm_by_days integer,
    free_cancel_days integer,
    plan_inclusions jsonb,
    plan_exclusions jsonb,
    plan_itinerary jsonb,
    plan_itinerary_image_url text,
    meeting_point_name text,
    meeting_address text,
    experience_point_name text,
    experience_address text,
    plan_notices jsonb,
    plan_refund_rules jsonb,
    description text,
    is_year_round boolean DEFAULT false NOT NULL,
    review_state text,
    pending_changes jsonb,
    pending_submitted_by_guide_id uuid,
    pending_submitted_at timestamp with time zone,
    pending_base_updated_at timestamp with time zone,
    review_admin_note text,
    pending_new_plan boolean DEFAULT false NOT NULL,
    CONSTRAINT activity_plans_base_price_check CHECK ((base_price >= 0)),
    CONSTRAINT activity_plans_booking_type_check CHECK ((booking_type = ANY (ARRAY['scheduled'::text, 'request'::text, 'instant'::text]))),
    CONSTRAINT activity_plans_check CHECK ((max_participants >= min_participants)),
    CONSTRAINT activity_plans_duration_minutes_check CHECK ((duration_minutes > 0)),
    CONSTRAINT activity_plans_min_participants_check CHECK ((min_participants > 0)),
    CONSTRAINT activity_plans_price_type_check CHECK ((price_type = ANY (ARRAY['per_person'::text, 'per_group'::text]))),
    CONSTRAINT activity_plans_review_state_check CHECK (((review_state IS NULL) OR (review_state = ANY (ARRAY['pending'::text, 'changes_requested'::text])))),
    CONSTRAINT activity_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
);


ALTER TABLE public.activity_plans OWNER TO postgres;

--
-- Name: COLUMN activity_plans.status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.activity_plans.status IS 'Lifecycle status: active=bookable by travelers; inactive=not bookable but visible to guide; archived=soft-deleted, hidden from traveler view';


--
-- Name: COLUMN activity_plans.is_year_round; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.activity_plans.is_year_round IS 'Explicit year-round availability flag. False means season availability must come from active activity_plan_seasons rows.';


--
-- Name: COLUMN activity_plans.pending_new_plan; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.activity_plans.pending_new_plan IS 'true=guide-created plan awaiting first approval (status inactive, not bookable); approval flips status to active and clears this flag';


--
-- Name: activity_qa; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_qa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id text NOT NULL,
    user_id uuid,
    question text NOT NULL,
    answer text,
    status text DEFAULT 'pending_moderation'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_qa_status_check CHECK ((status = ANY (ARRAY['pending_moderation'::text, 'approved'::text, 'rejected'::text])))
);


ALTER TABLE public.activity_qa OWNER TO postgres;

--
-- Name: activity_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_reviews (
    id text NOT NULL,
    activity_slug text NOT NULL,
    guide_slug text NOT NULL,
    author text NOT NULL,
    city text,
    rating integer NOT NULL,
    review_text text NOT NULL,
    review_date date NOT NULL,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'pending'::text NOT NULL,
    booking_id uuid,
    user_id uuid,
    photo_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    guide_reply_text text,
    guide_reply_at timestamp with time zone,
    CONSTRAINT activity_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT activity_reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


ALTER TABLE public.activity_reviews OWNER TO postgres;

--
-- Name: activity_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    capacity integer DEFAULT 10 NOT NULL,
    booked_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    plan_id text,
    min_participants integer DEFAULT 1,
    guide_note text,
    CONSTRAINT activity_schedules_status_check CHECK ((status = ANY (ARRAY['open'::text, 'full'::text, 'cancelled'::text])))
);


ALTER TABLE public.activity_schedules OWNER TO postgres;

--
-- Name: admin_security; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_security (
    id text NOT NULL,
    token_override text,
    session_version integer DEFAULT 1 NOT NULL,
    rotated_at timestamp with time zone,
    forced_logout_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.admin_security OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    order_id uuid,
    actor text,
    action text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_id_seq OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: booking_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.booking_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    from_status public.booking_status,
    to_status public.booking_status NOT NULL,
    changed_by uuid,
    reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.booking_status_history OWNER TO postgres;

--
-- Name: booking_status_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.booking_status_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    actor_user_id uuid,
    actor_role text NOT NULL,
    reason text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_status_logs_actor_role_check CHECK ((actor_role = ANY (ARRAY['traveler'::text, 'guide'::text, 'admin'::text, 'system'::text])))
);


ALTER TABLE public.booking_status_logs OWNER TO postgres;

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_no text NOT NULL,
    traveler_id uuid,
    guide_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    activity_plan_id uuid,
    source_channel text DEFAULT 'web'::text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    timezone text DEFAULT 'Asia/Taipei'::text NOT NULL,
    participants integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    order_id uuid,
    customer_note text,
    internal_note text,
    confirmed_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    conflict_override_id uuid,
    conflict_override_snapshot jsonb,
    schedule_id uuid,
    guide_approval_status text DEFAULT 'not_required'::text NOT NULL,
    guide_approval_decided_at timestamp with time zone,
    guide_approval_note text,
    CONSTRAINT bookings_check CHECK ((end_at > start_at)),
    CONSTRAINT bookings_guide_approval_status_check CHECK ((guide_approval_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT bookings_participants_check CHECK ((participants > 0)),
    CONSTRAINT bookings_source_channel_check CHECK ((source_channel = ANY (ARRAY['web'::text, 'line'::text, 'admin_pos'::text, 'external'::text]))),
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_confirmation'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text, 'reschedule_requested'::text, 'external_hold'::text])))
);


ALTER TABLE public.bookings OWNER TO postgres;

--
-- Name: COLUMN bookings.conflict_override_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bookings.conflict_override_id IS 'Nullable admin conflict override id captured when a blocked guide slot is explicitly allowed.';


--
-- Name: COLUMN bookings.conflict_override_snapshot; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bookings.conflict_override_snapshot IS 'Booking-time snapshot of override metadata for audit/debug without relying on mutable override rows.';


--
-- Name: COLUMN bookings.guide_approval_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bookings.guide_approval_status IS 'request plan 的導遊審核維度（與 status 正交）：not_required(instant/scheduled) | pending | approved | rejected';


--
-- Name: COLUMN bookings.guide_approval_decided_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bookings.guide_approval_decided_at IS '導遊做出審核決定（approve/reject）的時間';


--
-- Name: COLUMN bookings.guide_approval_note; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bookings.guide_approval_note IS '導遊審核備註（婉拒理由等）';


--
-- Name: cron_job_controls; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cron_job_controls (
    job_key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text,
    reason text
);


ALTER TABLE public.cron_job_controls OWNER TO postgres;

--
-- Name: cron_run_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cron_run_log (
    id bigint NOT NULL,
    job_key text NOT NULL,
    outcome text NOT NULL,
    summary jsonb,
    source text DEFAULT 'schedule'::text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cron_run_log_outcome_check CHECK ((outcome = ANY (ARRAY['success'::text, 'error'::text, 'skipped_by_admin'::text])))
);


ALTER TABLE public.cron_run_log OWNER TO postgres;

--
-- Name: cron_run_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.cron_run_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cron_run_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    id bigint NOT NULL,
    event_name text NOT NULL,
    session_id text,
    contact_email text,
    order_id uuid,
    activity_id uuid,
    schedule_id uuid,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_code text,
    page_path text,
    referrer text,
    user_agent text,
    ip_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: TABLE events; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.events IS 'User behavior event tracking for funnel analysis. Write via /api/events only.';


--
-- Name: COLUMN events.event_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.event_name IS 'page_view|view_item_list|select_item|view_item|begin_checkout|purchase_intent|payment_callback_received|payment_succeeded|error';


--
-- Name: COLUMN events.session_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.session_id IS 'Client-generated anonymous session UUID (sessionStorage)';


--
-- Name: COLUMN events.properties; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.properties IS 'Event-specific payload. See docs/06-analytics/01-event-tracking-design.md';


--
-- Name: COLUMN events.ip_hash; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.ip_hash IS 'SHA-256 of client IP for anonymous unique visitor counting';


--
-- Name: COLUMN events.utm_source; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.utm_source IS 'UTM source (e.g. google, facebook, line)';


--
-- Name: COLUMN events.utm_medium; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.utm_medium IS 'UTM medium (e.g. cpc, social, email)';


--
-- Name: COLUMN events.utm_campaign; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.utm_campaign IS 'UTM campaign name';


--
-- Name: COLUMN events.utm_content; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.utm_content IS 'UTM content differentiator (A/B variants)';


--
-- Name: COLUMN events.utm_term; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.utm_term IS 'UTM paid keyword term';


--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.events_id_seq OWNER TO postgres;

--
-- Name: events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.events_id_seq OWNED BY public.events.id;


--
-- Name: experiences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.experiences (
    id uuid NOT NULL,
    guide_id uuid,
    slug text NOT NULL,
    title text NOT NULL,
    price_twd integer NOT NULL
);


ALTER TABLE public.experiences OWNER TO postgres;

--
-- Name: guide_applications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guide_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    phone text,
    email text,
    city text,
    bio text,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    specialties jsonb DEFAULT '[]'::jsonb NOT NULL,
    languages jsonb DEFAULT '[]'::jsonb NOT NULL,
    regions jsonb DEFAULT '[]'::jsonb NOT NULL,
    certifications jsonb DEFAULT '[]'::jsonb NOT NULL,
    payment_method text,
    profile_photo_url text,
    hero_image_url text,
    gallery_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    payment_methods jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT guide_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'suspended'::text])))
);


ALTER TABLE public.guide_applications OWNER TO postgres;

--
-- Name: COLUMN guide_applications.specialties; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_applications.specialties IS '申請人專長領域（文字陣列）；上線時自動帶入 guide_profiles.specialties';


--
-- Name: COLUMN guide_applications.languages; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_applications.languages IS '申請人可用語言（文字陣列）；上線時自動帶入 guide_profiles.languages';


--
-- Name: COLUMN guide_applications.regions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_applications.regions IS '申請人可服務地區（文字陣列）';


--
-- Name: COLUMN guide_applications.certifications; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_applications.certifications IS '申請人自述證照清單（文字陣列）；僅供審核參考，不自動標記 guide_license_verified';


--
-- Name: COLUMN guide_applications.payment_method; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_applications.payment_method IS '申請人偏好收款方式（bank / linepay / transfer）';


--
-- Name: COLUMN guide_applications.profile_photo_url; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_applications.profile_photo_url IS '申請者個人照片（公開 URL，必填於表單層）';


--
-- Name: COLUMN guide_applications.hero_image_url; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_applications.hero_image_url IS '申請者個人封面（公開 URL，選填）';


--
-- Name: COLUMN guide_applications.gallery_urls; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_applications.gallery_urls IS '申請者活動照片 URL 陣列（選填，最多 12）';


--
-- Name: COLUMN guide_applications.payment_methods; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_applications.payment_methods IS '申請人偏好收款方式（文字陣列，複選）；上線時自動帶入 guide_profiles.payment_methods';


--
-- Name: guide_availability_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guide_availability_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guide_id uuid NOT NULL,
    activity_plan_id uuid,
    weekday integer NOT NULL,
    start_time_local time without time zone NOT NULL,
    end_time_local time without time zone NOT NULL,
    timezone text DEFAULT 'Asia/Taipei'::text NOT NULL,
    slot_interval_minutes integer DEFAULT 30 NOT NULL,
    buffer_before_minutes integer DEFAULT 0 NOT NULL,
    buffer_after_minutes integer DEFAULT 0 NOT NULL,
    effective_from date,
    effective_to date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    use_dynamic_reemit boolean DEFAULT false NOT NULL,
    CONSTRAINT guide_availability_rules_buffer_after_minutes_check CHECK ((buffer_after_minutes >= 0)),
    CONSTRAINT guide_availability_rules_buffer_before_minutes_check CHECK ((buffer_before_minutes >= 0)),
    CONSTRAINT guide_availability_rules_check CHECK ((end_time_local > start_time_local)),
    CONSTRAINT guide_availability_rules_check1 CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT guide_availability_rules_slot_interval_minutes_check CHECK ((slot_interval_minutes > 0)),
    CONSTRAINT guide_availability_rules_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);


ALTER TABLE public.guide_availability_rules OWNER TO postgres;

--
-- Name: COLUMN guide_availability_rules.use_dynamic_reemit; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_availability_rules.use_dynamic_reemit IS 'GH-1290: when true, after a booking conflict the slot generator re-emits a candidate at booking_end + buffer_after_minutes instead of the fixed grid only. Default FALSE preserves pre-#1290 behaviour.';


--
-- Name: guide_balances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guide_balances (
    guide_id uuid NOT NULL,
    balance_twd integer DEFAULT 0 NOT NULL,
    last_settled_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.guide_balances OWNER TO postgres;

--
-- Name: guide_blackout_dates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guide_blackout_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guide_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    reason text,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guide_blackout_dates_check CHECK ((ends_at > starts_at)),
    CONSTRAINT guide_blackout_dates_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'system'::text])))
);


ALTER TABLE public.guide_blackout_dates OWNER TO postgres;

--
-- Name: guide_line_bind_code; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guide_line_bind_code (
    code text NOT NULL,
    guide_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.guide_line_bind_code OWNER TO postgres;

--
-- Name: guide_line_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guide_line_mapping (
    guide_id uuid NOT NULL,
    line_user_id text NOT NULL,
    display_name text,
    is_blocked boolean DEFAULT false NOT NULL,
    bound_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.guide_line_mapping OWNER TO postgres;

--
-- Name: guide_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guide_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    slug text NOT NULL,
    display_name text NOT NULL,
    headline text,
    bio text,
    region text,
    languages jsonb DEFAULT '[]'::jsonb NOT NULL,
    specialties jsonb DEFAULT '[]'::jsonb NOT NULL,
    profile_photo_url text,
    hero_image_url text,
    gallery_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    verification_status text DEFAULT 'pending'::text NOT NULL,
    id_verified boolean DEFAULT false NOT NULL,
    guide_license_verified boolean DEFAULT false NOT NULL,
    rating_avg numeric(3,2),
    review_count integer DEFAULT 0 NOT NULL,
    service_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invite_token text,
    invite_token_expires_at timestamp with time zone,
    guide_password_hash text,
    guide_session_version integer DEFAULT 1 NOT NULL,
    guide_email text,
    is_published boolean DEFAULT false NOT NULL,
    bank_name text,
    account_name text,
    account_number text,
    transfer_note text,
    regions jsonb DEFAULT '[]'::jsonb NOT NULL,
    certifications jsonb DEFAULT '[]'::jsonb NOT NULL,
    payment_methods jsonb DEFAULT '[]'::jsonb NOT NULL,
    contact_phone text,
    contact_phone_visible boolean DEFAULT false NOT NULL,
    experience_years integer,
    CONSTRAINT guide_profiles_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'suspended'::text])))
);


ALTER TABLE public.guide_profiles OWNER TO postgres;

--
-- Name: COLUMN guide_profiles.is_published; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_profiles.is_published IS '導遊自主發佈開關：true 才會出現在「認識導遊」公開列表';


--
-- Name: COLUMN guide_profiles.bank_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_profiles.bank_name IS '#1475 匯款銀行名稱（不公開，僅付款步驟揭露）';


--
-- Name: COLUMN guide_profiles.account_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_profiles.account_name IS '#1475 匯款戶名（不公開）';


--
-- Name: COLUMN guide_profiles.account_number; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_profiles.account_number IS '#1475 匯款帳號（不公開）';


--
-- Name: COLUMN guide_profiles.transfer_note; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_profiles.transfer_note IS '#1475 匯款備註／說明（不公開）';


--
-- Name: COLUMN guide_profiles.regions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_profiles.regions IS '導遊熟悉區域（文字陣列，複選）；上線時自動帶入自申請的 regions，導遊可於後台自行修改';


--
-- Name: COLUMN guide_profiles.certifications; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_profiles.certifications IS '導遊專業證照（文字陣列）；上線時自動帶入自申請的 certifications，導遊可於後台自行修改';


--
-- Name: COLUMN guide_profiles.payment_methods; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_profiles.payment_methods IS '導遊收款方式（文字陣列，複選，bank / linepay / transfer）；公開頁顯示可接受方式';


--
-- Name: guide_slot_conflict_overrides; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guide_slot_conflict_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guide_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    activity_plan_id uuid NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    reason text NOT NULL,
    requires_helper boolean DEFAULT false NOT NULL,
    helper_status text DEFAULT 'not_needed'::text NOT NULL,
    guide_note text,
    admin_note text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_admin_email text,
    helper_decided_at timestamp with time zone,
    CONSTRAINT guide_slot_conflict_overrides_check CHECK ((end_at > start_at)),
    CONSTRAINT guide_slot_conflict_overrides_helper_status_check CHECK ((helper_status = ANY (ARRAY['not_needed'::text, 'required'::text, 'pending_assignment'::text, 'assigned'::text, 'declined'::text]))),
    CONSTRAINT guide_slot_conflict_overrides_reason_check CHECK ((btrim(reason) <> ''::text)),
    CONSTRAINT guide_slot_conflict_overrides_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text, 'cancelled'::text])))
);


ALTER TABLE public.guide_slot_conflict_overrides OWNER TO postgres;

--
-- Name: TABLE guide_slot_conflict_overrides; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.guide_slot_conflict_overrides IS 'Admin conflict override for otherwise blocked guide slots; must not be treated as ordinary availability.';


--
-- Name: COLUMN guide_slot_conflict_overrides.reason; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_slot_conflict_overrides.reason IS 'Operator-visible reason for overriding a blocked guide slot.';


--
-- Name: COLUMN guide_slot_conflict_overrides.requires_helper; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_slot_conflict_overrides.requires_helper IS 'Whether the override requires a helper/assistant to safely serve the slot.';


--
-- Name: COLUMN guide_slot_conflict_overrides.helper_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_slot_conflict_overrides.helper_status IS 'Helper coordination state for the override: not_needed, required, pending_assignment, assigned, declined.';


--
-- Name: COLUMN guide_slot_conflict_overrides.status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_slot_conflict_overrides.status IS 'Lifecycle state for the override record: active, disabled, or cancelled.';


--
-- Name: COLUMN guide_slot_conflict_overrides.created_by_admin_email; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_slot_conflict_overrides.created_by_admin_email IS 'Admin email recorded for future privileged mutation/audit routes.';


--
-- Name: COLUMN guide_slot_conflict_overrides.helper_decided_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.guide_slot_conflict_overrides.helper_decided_at IS 'When the guide confirmed/declined the helper for this override (#1497).';


--
-- Name: guide_trip_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.guide_trip_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    guide_id uuid NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    trip_completed boolean DEFAULT true NOT NULL,
    traveler_no_show boolean DEFAULT false NOT NULL,
    guide_concern text,
    safety_concern text,
    internal_note text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    revised_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guide_trip_reports_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'revised'::text])))
);


ALTER TABLE public.guide_trip_reports OWNER TO postgres;

--
-- Name: homepage_featured_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.homepage_featured_settings (
    id text DEFAULT 'default'::text NOT NULL,
    editor_pick_slug text,
    more_featured_slugs jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text,
    editor_pick_copy jsonb DEFAULT '{}'::jsonb NOT NULL,
    more_featured_copy jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE public.homepage_featured_settings OWNER TO postgres;

--
-- Name: incidents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    severity text NOT NULL,
    source text NOT NULL,
    category text,
    fingerprint text,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    CONSTRAINT incidents_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warn'::text, 'error'::text, 'critical'::text])))
);


ALTER TABLE public.incidents OWNER TO postgres;

--
-- Name: kpi_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kpi_settings (
    id text DEFAULT 'default'::text NOT NULL,
    commission_rate numeric(5,4) DEFAULT 0.15 NOT NULL,
    payment_fee_rate numeric(5,4) DEFAULT 0.035 NOT NULL,
    guide_payout_rate numeric(5,4) DEFAULT 0.65 NOT NULL,
    healthy_min_contribution_twd integer DEFAULT 1 NOT NULL,
    healthy_allow_exception boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.kpi_settings OWNER TO postgres;

--
-- Name: kpi_settings_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kpi_settings_history (
    version_id text NOT NULL,
    actor text,
    action text,
    note text,
    before_payload jsonb,
    config_payload jsonb,
    source_version_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.kpi_settings_history OWNER TO postgres;

--
-- Name: line_bind_code; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.line_bind_code (
    code text NOT NULL,
    user_id uuid,
    contact_email text,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.line_bind_code OWNER TO postgres;

--
-- Name: line_user_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.line_user_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    line_user_id text NOT NULL,
    user_id uuid,
    contact_email text,
    display_name text,
    is_blocked boolean DEFAULT false NOT NULL,
    bound_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.line_user_mapping OWNER TO postgres;

--
-- Name: line_webhook_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.line_webhook_events (
    webhook_event_id text NOT NULL,
    event_type text NOT NULL,
    line_user_id text,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.line_webhook_events OWNER TO postgres;

--
-- Name: midao_availability_defaults; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.midao_availability_defaults (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guide_id uuid NOT NULL,
    weekday smallint NOT NULL,
    period text NOT NULL,
    is_open boolean DEFAULT false NOT NULL,
    CONSTRAINT midao_availability_defaults_period_check CHECK ((period = ANY (ARRAY['morning'::text, 'afternoon'::text, 'evening'::text]))),
    CONSTRAINT midao_availability_defaults_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);


ALTER TABLE public.midao_availability_defaults OWNER TO postgres;

--
-- Name: midao_day_overrides; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.midao_day_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guide_id uuid NOT NULL,
    date date NOT NULL,
    period text NOT NULL,
    is_open boolean DEFAULT true NOT NULL,
    custom_start time without time zone,
    custom_end time without time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT midao_day_overrides_period_check CHECK ((period = ANY (ARRAY['morning'::text, 'afternoon'::text, 'evening'::text, 'custom'::text])))
);


ALTER TABLE public.midao_day_overrides OWNER TO postgres;

--
-- Name: midao_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.midao_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_no text NOT NULL,
    guide_id uuid NOT NULL,
    activity_id uuid,
    activity_title_snapshot text,
    traveler_name text NOT NULL,
    traveler_line_id text,
    traveler_email text,
    preferred_date date NOT NULL,
    backup_date date,
    preferred_period text,
    start_time time without time zone,
    end_time time without time zone,
    participants_count integer DEFAULT 1 NOT NULL,
    participants_note text,
    language text,
    need_pickup boolean DEFAULT false NOT NULL,
    special_note text,
    answers jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    source text DEFAULT 'public_page'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    plan_id uuid,
    plan_title_snapshot text,
    CONSTRAINT midao_requests_preferred_period_check CHECK ((preferred_period = ANY (ARRAY['morning'::text, 'afternoon'::text, 'evening'::text]))),
    CONSTRAINT midao_requests_source_check CHECK ((source = ANY (ARRAY['public_page'::text, 'manual'::text]))),
    CONSTRAINT midao_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'pending_reply'::text, 'replied'::text, 'closed_won'::text, 'closed_done'::text])))
);


ALTER TABLE public.midao_requests OWNER TO postgres;

--
-- Name: notification_event_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_event_settings (
    id text DEFAULT 'singleton'::text NOT NULL,
    overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification_event_settings OWNER TO postgres;

--
-- Name: notification_event_settings_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_event_settings_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    event_key text NOT NULL,
    recipient text NOT NULL,
    channel text NOT NULL,
    to_value boolean NOT NULL
);


ALTER TABLE public.notification_event_settings_audit OWNER TO postgres;

--
-- Name: operations_tracking; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.operations_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    manual_minutes integer DEFAULT 0 NOT NULL,
    manual_cost_twd integer DEFAULT 0 NOT NULL,
    refund_amount_twd integer DEFAULT 0 NOT NULL,
    subsidy_twd integer DEFAULT 0 NOT NULL,
    is_rescheduled boolean DEFAULT false NOT NULL,
    has_complaint boolean DEFAULT false NOT NULL,
    has_guide_adjustment boolean DEFAULT false NOT NULL,
    has_oversell_issue boolean DEFAULT false NOT NULL,
    note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_disputed boolean DEFAULT false NOT NULL,
    is_safety_case boolean DEFAULT false NOT NULL
);


ALTER TABLE public.operations_tracking OWNER TO postgres;

--
-- Name: order_addons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_addons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    addon_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price_twd integer NOT NULL,
    subtotal_twd integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_addons_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT order_addons_subtotal_twd_check CHECK ((subtotal_twd >= 0)),
    CONSTRAINT order_addons_unit_price_twd_check CHECK ((unit_price_twd >= 0))
);


ALTER TABLE public.order_addons OWNER TO postgres;

--
-- Name: order_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_events (
    id bigint NOT NULL,
    order_id uuid,
    event_type text NOT NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.order_events OWNER TO postgres;

--
-- Name: order_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_events_id_seq OWNER TO postgres;

--
-- Name: order_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_events_id_seq OWNED BY public.order_events.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    item_type text NOT NULL,
    ref_id uuid,
    title text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price integer NOT NULL,
    subtotal_amount integer NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    booking_id uuid,
    CONSTRAINT ck_order_items_booking_required_for_activity_booking CHECK (((item_type <> 'activity_booking'::text) OR (booking_id IS NOT NULL))),
    CONSTRAINT order_items_item_type_check CHECK ((item_type = ANY (ARRAY['activity_booking'::text, 'adjustment'::text, 'fee'::text, 'discount'::text]))),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: order_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    sender_role text NOT NULL,
    sender_id text,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_messages_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 1000))),
    CONSTRAINT order_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['traveler'::text, 'guide'::text, 'admin'::text])))
);


ALTER TABLE public.order_messages OWNER TO postgres;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid,
    schedule_id uuid,
    status text DEFAULT 'pending_payment'::text NOT NULL,
    people_count integer DEFAULT 1 NOT NULL,
    total_twd integer DEFAULT 0 NOT NULL,
    contact_name text,
    contact_phone text,
    contact_email text,
    admin_note text,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    booking_id uuid,
    source_channel text DEFAULT 'web'::text,
    handled_by uuid,
    discount_amount integer DEFAULT 0 NOT NULL,
    payment_status text DEFAULT 'pending'::text,
    trade_no text,
    payment_deadline_at timestamp with time zone,
    booking_no bigint,
    refund_policy_snapshot jsonb,
    CONSTRAINT orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'partially_paid'::text, 'paid'::text, 'failed'::text, 'refunded'::text, 'partially_refunded'::text]))),
    CONSTRAINT orders_source_channel_check CHECK ((source_channel = ANY (ARRAY['web'::text, 'line'::text, 'admin_pos'::text, 'external'::text])))
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: COLUMN orders.payment_deadline_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.orders.payment_deadline_at IS 'Payment deadline for unpaid orders (#1493): instant/scheduled from creation, request from guide approval; NULL while a request awaits approval.';


--
-- Name: orders_booking_no_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_booking_no_seq
    START WITH 100000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_booking_no_seq OWNER TO postgres;

--
-- Name: package_activities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.package_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    package_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.package_activities OWNER TO postgres;

--
-- Name: payment_booking_mismatch_governance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_booking_mismatch_governance (
    id bigint NOT NULL,
    payment_id uuid NOT NULL,
    order_id uuid NOT NULL,
    legacy_label text NOT NULL,
    governance_status text DEFAULT 'accepted_legacy'::text NOT NULL,
    reason text,
    evidence_source text,
    approved_by text,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_booking_mismatch_governance_label_chk CHECK ((legacy_label = ANY (ARRAY['legacy_missing_booking'::text, 'legacy_backfill_gap'::text, 'accepted_legacy_exception'::text]))),
    CONSTRAINT payment_booking_mismatch_governance_status_chk CHECK ((governance_status = ANY (ARRAY['accepted_legacy'::text, 'pending_review'::text, 'rejected'::text])))
);


ALTER TABLE public.payment_booking_mismatch_governance OWNER TO postgres;

--
-- Name: payment_booking_mismatch_governance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payment_booking_mismatch_governance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_booking_mismatch_governance_id_seq OWNER TO postgres;

--
-- Name: payment_booking_mismatch_governance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payment_booking_mismatch_governance_id_seq OWNED BY public.payment_booking_mismatch_governance.id;


--
-- Name: payment_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    event_type text NOT NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    order_id uuid,
    trade_no text,
    provider text DEFAULT 'ecpay'::text NOT NULL,
    merchant_trade_no text,
    CONSTRAINT payment_events_event_type_check CHECK ((event_type = ANY (ARRAY['initiated'::text, 'initiated_reused'::text, 'callback_received'::text, 'authorized'::text, 'paid'::text, 'callback_paid'::text, 'provider_reconciled_paid'::text, 'failed'::text, 'refunded'::text, 'authorization_voided'::text, 'cancelled'::text, 'additional_payment'::text, 'reversal_blocked'::text, 'reversal_incident'::text])))
);


ALTER TABLE public.payment_events OWNER TO postgres;

--
-- Name: payment_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    event_type text NOT NULL,
    event_data jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.payment_logs OWNER TO postgres;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    provider text DEFAULT 'ecpay'::text NOT NULL,
    trade_no text,
    amount_twd integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'created'::text NOT NULL,
    paid_at timestamp with time zone,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    merchant_trade_no text,
    currency text DEFAULT 'TWD'::text NOT NULL,
    provider_status text,
    authorized_at timestamp with time zone,
    voided_at timestamp with time zone,
    refunded_at timestamp with time zone,
    captured_amount_twd integer DEFAULT 0 NOT NULL,
    refunded_amount_twd integer DEFAULT 0 NOT NULL,
    last_provider_query_payload jsonb,
    booking_id uuid
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: payout_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payout_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    guide_id uuid NOT NULL,
    gmv_twd integer NOT NULL,
    commission_twd integer NOT NULL,
    net_twd integer NOT NULL,
    rules_version text DEFAULT 'v1'::text NOT NULL,
    settled_at timestamp with time zone DEFAULT now(),
    settlement_kind text DEFAULT 'settlement'::text NOT NULL,
    CONSTRAINT payout_items_settlement_kind_check CHECK ((settlement_kind = ANY (ARRAY['settlement'::text, 'reversal'::text])))
);


ALTER TABLE public.payout_items OWNER TO postgres;

--
-- Name: payouts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guide_id uuid NOT NULL,
    total_twd integer NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    confirmed_by text,
    confirmed_at timestamp with time zone,
    transfer_ref text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payouts_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])))
);


ALTER TABLE public.payouts OWNER TO postgres;

--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    discount_type text NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    max_uses integer DEFAULT 100 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    per_user_limit integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    public_label text,
    CONSTRAINT promo_codes_discount_type_check CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'fixed'::text]))),
    CONSTRAINT promo_codes_discount_value_check CHECK ((discount_value > (0)::numeric))
);


ALTER TABLE public.promo_codes OWNER TO postgres;

--
-- Name: promo_redemptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.promo_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    promo_code_id uuid NOT NULL,
    order_id uuid,
    redeemed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.promo_redemptions OWNER TO postgres;

--
-- Name: refund_policies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refund_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text NOT NULL,
    tiers jsonb NOT NULL,
    reschedule_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    force_majeure_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.refund_policies OWNER TO postgres;

--
-- Name: refund_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refund_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    reason text DEFAULT 'user_request'::text NOT NULL,
    note text,
    status text DEFAULT 'requested'::text NOT NULL,
    admin_note text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    refunded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    request_id text,
    retry_count integer DEFAULT 0 NOT NULL,
    last_error text,
    policy_snapshot jsonb
);


ALTER TABLE public.refund_requests OWNER TO postgres;

--
-- Name: COLUMN refund_requests.policy_snapshot; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.refund_requests.policy_snapshot IS 'Snapshot of calculateRefundAmount() result at submission time (refund_pct, refundable_amount, breakdown, policy.version). Used by downstream automation to honor the quoted amount.';


--
-- Name: reschedule_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reschedule_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    request_id text NOT NULL,
    from_schedule_id uuid,
    to_schedule_id uuid NOT NULL,
    from_start_at timestamp with time zone,
    to_start_at timestamp with time zone,
    status text DEFAULT 'requested'::text NOT NULL,
    prior_order_status text NOT NULL,
    amount_delta_twd integer DEFAULT 0 NOT NULL,
    resolver text,
    note text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reschedule_requests_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text, 'expired'::text])))
);


ALTER TABLE public.reschedule_requests OWNER TO postgres;

--
-- Name: review_invitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.review_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    invitation_kind text DEFAULT 'post_trip_review'::text NOT NULL,
    channel text DEFAULT 'email'::text NOT NULL,
    status text NOT NULL,
    initiated_by text NOT NULL,
    sent_at timestamp with time zone,
    failed_at timestamp with time zone,
    failure_reason text,
    provider_message_id text,
    eligibility_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT review_invitations_channel_check CHECK ((channel = 'email'::text)),
    CONSTRAINT review_invitations_initiated_by_check CHECK ((initiated_by = ANY (ARRAY['admin_manual'::text, 'cron'::text]))),
    CONSTRAINT review_invitations_invitation_kind_check CHECK ((invitation_kind = 'post_trip_review'::text)),
    CONSTRAINT review_invitations_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'suppressed'::text])))
);


ALTER TABLE public.review_invitations OWNER TO postgres;

--
-- Name: settlement_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.settlement_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text DEFAULT 'v1'::text NOT NULL,
    commission_rate numeric(5,4) DEFAULT 0.15 NOT NULL,
    t_days integer DEFAULT 7 NOT NULL,
    min_withdrawal_twd integer DEFAULT 5000 NOT NULL,
    fee_absorbed_by text DEFAULT 'platform'::text NOT NULL,
    notes text,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by text
);


ALTER TABLE public.settlement_rules OWNER TO postgres;

--
-- Name: soft_launch_control_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.soft_launch_control_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    control_key text NOT NULL,
    from_value boolean,
    to_value boolean NOT NULL,
    reason text NOT NULL,
    rollback_instruction text
);


ALTER TABLE public.soft_launch_control_audit OWNER TO postgres;

--
-- Name: soft_launch_controls; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.soft_launch_controls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    public_paused boolean DEFAULT false NOT NULL,
    new_booking_paused boolean DEFAULT false NOT NULL,
    refund_manual_only boolean DEFAULT false NOT NULL,
    whitelist_enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.soft_launch_controls OWNER TO postgres;

--
-- Name: soft_launch_whitelist; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.soft_launch_whitelist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_type text NOT NULL,
    value text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT soft_launch_whitelist_entry_type_check CHECK ((entry_type = ANY (ARRAY['traveler_user_id'::text, 'activity_id'::text, 'guide_id'::text])))
);


ALTER TABLE public.soft_launch_whitelist OWNER TO postgres;

--
-- Name: telegram_bind_code; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.telegram_bind_code (
    code text NOT NULL,
    role text NOT NULL,
    subject_id text,
    contact_email text,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_bind_code_role_check CHECK ((role = ANY (ARRAY['guide'::text, 'traveler'::text])))
);


ALTER TABLE public.telegram_bind_code OWNER TO postgres;

--
-- Name: telegram_chat_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.telegram_chat_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role text NOT NULL,
    subject_id text,
    contact_email text,
    chat_id text NOT NULL,
    display_name text,
    is_blocked boolean DEFAULT false NOT NULL,
    bound_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_chat_mapping_role_check CHECK ((role = ANY (ARRAY['guide'::text, 'traveler'::text])))
);


ALTER TABLE public.telegram_chat_mapping OWNER TO postgres;

--
-- Name: telegram_webhook_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.telegram_webhook_events (
    update_id text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.telegram_webhook_events OWNER TO postgres;

--
-- Name: tour_reminder_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tour_reminder_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    reminder_kind text NOT NULL,
    channel text NOT NULL,
    status text NOT NULL,
    sent_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tour_reminder_log_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'line_notify_admin'::text, 'line_push'::text]))),
    CONSTRAINT tour_reminder_log_reminder_kind_check CHECK ((reminder_kind = ANY (ARRAY['h24'::text, 'h1'::text]))),
    CONSTRAINT tour_reminder_log_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'skipped'::text])))
);


ALTER TABLE public.tour_reminder_log OWNER TO postgres;

--
-- Name: traveler_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.traveler_profiles (
    user_id uuid NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    marketing_email_opt_in boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    region text
);


ALTER TABLE public.traveler_profiles OWNER TO postgres;

--
-- Name: user_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    link_path text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_notifications_type_check CHECK ((type = ANY (ARRAY['message_reply'::text, 'reschedule_result'::text, 'order_status'::text, 'review_invited'::text])))
);


ALTER TABLE public.user_notifications OWNER TO postgres;

--
-- Name: user_points_ledger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_points_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    delta integer NOT NULL,
    reason text NOT NULL,
    order_id uuid,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_points_ledger_reason_check CHECK ((reason = ANY (ARRAY['earn_order'::text, 'redeem_order'::text, 'expire'::text, 'refund_reclaim'::text, 'adjust'::text])))
);


ALTER TABLE public.user_points_ledger OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role text NOT NULL,
    email text,
    name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_url text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['traveler'::text, 'guide'::text, 'admin'::text])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: wishlists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wishlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.wishlists OWNER TO postgres;

--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events ALTER COLUMN id SET DEFAULT nextval('public.events_id_seq'::regclass);


--
-- Name: order_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_events ALTER COLUMN id SET DEFAULT nextval('public.order_events_id_seq'::regclass);


--
-- Name: payment_booking_mismatch_governance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_booking_mismatch_governance ALTER COLUMN id SET DEFAULT nextval('public.payment_booking_mismatch_governance_id_seq'::regclass);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: activities activities_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_slug_key UNIQUE (slug);


--
-- Name: activity_addons activity_addons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_addons
    ADD CONSTRAINT activity_addons_pkey PRIMARY KEY (id);


--
-- Name: activity_images activity_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_images
    ADD CONSTRAINT activity_images_pkey PRIMARY KEY (id);


--
-- Name: activity_packages activity_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_packages
    ADD CONSTRAINT activity_packages_pkey PRIMARY KEY (id);


--
-- Name: activity_plan_seasons activity_plan_seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_plan_seasons
    ADD CONSTRAINT activity_plan_seasons_pkey PRIMARY KEY (id);


--
-- Name: activity_plan_tiers activity_plan_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_plan_tiers
    ADD CONSTRAINT activity_plan_tiers_pkey PRIMARY KEY (id);


--
-- Name: activity_plan_tiers activity_plan_tiers_plan_id_tier_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_plan_tiers
    ADD CONSTRAINT activity_plan_tiers_plan_id_tier_key UNIQUE (plan_id, tier);


--
-- Name: activity_plans activity_plans_activity_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_plans
    ADD CONSTRAINT activity_plans_activity_id_slug_key UNIQUE (activity_id, slug);


--
-- Name: activity_plans activity_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_plans
    ADD CONSTRAINT activity_plans_pkey PRIMARY KEY (id);


--
-- Name: activity_qa activity_qa_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_qa
    ADD CONSTRAINT activity_qa_pkey PRIMARY KEY (id);


--
-- Name: activity_reviews activity_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_reviews
    ADD CONSTRAINT activity_reviews_pkey PRIMARY KEY (id);


--
-- Name: activity_schedules activity_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_schedules
    ADD CONSTRAINT activity_schedules_pkey PRIMARY KEY (id);


--
-- Name: admin_security admin_security_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_security
    ADD CONSTRAINT admin_security_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: booking_status_history booking_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_status_history
    ADD CONSTRAINT booking_status_history_pkey PRIMARY KEY (id);


--
-- Name: booking_status_logs booking_status_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_status_logs
    ADD CONSTRAINT booking_status_logs_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_booking_no_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_booking_no_key UNIQUE (booking_no);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: cron_job_controls cron_job_controls_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cron_job_controls
    ADD CONSTRAINT cron_job_controls_pkey PRIMARY KEY (job_key);


--
-- Name: cron_run_log cron_run_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cron_run_log
    ADD CONSTRAINT cron_run_log_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: experiences experiences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.experiences
    ADD CONSTRAINT experiences_pkey PRIMARY KEY (id);


--
-- Name: experiences experiences_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.experiences
    ADD CONSTRAINT experiences_slug_key UNIQUE (slug);


--
-- Name: guide_applications guide_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_applications
    ADD CONSTRAINT guide_applications_pkey PRIMARY KEY (id);


--
-- Name: guide_availability_rules guide_availability_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_availability_rules
    ADD CONSTRAINT guide_availability_rules_pkey PRIMARY KEY (id);


--
-- Name: guide_balances guide_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_balances
    ADD CONSTRAINT guide_balances_pkey PRIMARY KEY (guide_id);


--
-- Name: guide_blackout_dates guide_blackout_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_blackout_dates
    ADD CONSTRAINT guide_blackout_dates_pkey PRIMARY KEY (id);


--
-- Name: guide_line_bind_code guide_line_bind_code_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_line_bind_code
    ADD CONSTRAINT guide_line_bind_code_pkey PRIMARY KEY (code);


--
-- Name: guide_line_mapping guide_line_mapping_line_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_line_mapping
    ADD CONSTRAINT guide_line_mapping_line_user_id_key UNIQUE (line_user_id);


--
-- Name: guide_line_mapping guide_line_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_line_mapping
    ADD CONSTRAINT guide_line_mapping_pkey PRIMARY KEY (guide_id);


--
-- Name: guide_profiles guide_profiles_guide_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_profiles
    ADD CONSTRAINT guide_profiles_guide_email_key UNIQUE (guide_email);


--
-- Name: guide_profiles guide_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_profiles
    ADD CONSTRAINT guide_profiles_pkey PRIMARY KEY (id);


--
-- Name: guide_profiles guide_profiles_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_profiles
    ADD CONSTRAINT guide_profiles_slug_key UNIQUE (slug);


--
-- Name: guide_slot_conflict_overrides guide_slot_conflict_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_slot_conflict_overrides
    ADD CONSTRAINT guide_slot_conflict_overrides_pkey PRIMARY KEY (id);


--
-- Name: guide_trip_reports guide_trip_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_trip_reports
    ADD CONSTRAINT guide_trip_reports_pkey PRIMARY KEY (id);


--
-- Name: homepage_featured_settings homepage_featured_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.homepage_featured_settings
    ADD CONSTRAINT homepage_featured_settings_pkey PRIMARY KEY (id);


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);


--
-- Name: kpi_settings_history kpi_settings_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kpi_settings_history
    ADD CONSTRAINT kpi_settings_history_pkey PRIMARY KEY (version_id);


--
-- Name: kpi_settings kpi_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kpi_settings
    ADD CONSTRAINT kpi_settings_pkey PRIMARY KEY (id);


--
-- Name: line_bind_code line_bind_code_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.line_bind_code
    ADD CONSTRAINT line_bind_code_pkey PRIMARY KEY (code);


--
-- Name: line_user_mapping line_user_mapping_line_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.line_user_mapping
    ADD CONSTRAINT line_user_mapping_line_user_id_key UNIQUE (line_user_id);


--
-- Name: line_user_mapping line_user_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.line_user_mapping
    ADD CONSTRAINT line_user_mapping_pkey PRIMARY KEY (id);


--
-- Name: line_webhook_events line_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.line_webhook_events
    ADD CONSTRAINT line_webhook_events_pkey PRIMARY KEY (webhook_event_id);


--
-- Name: midao_availability_defaults midao_availability_defaults_guide_id_weekday_period_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.midao_availability_defaults
    ADD CONSTRAINT midao_availability_defaults_guide_id_weekday_period_key UNIQUE (guide_id, weekday, period);


--
-- Name: midao_availability_defaults midao_availability_defaults_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.midao_availability_defaults
    ADD CONSTRAINT midao_availability_defaults_pkey PRIMARY KEY (id);


--
-- Name: midao_day_overrides midao_day_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.midao_day_overrides
    ADD CONSTRAINT midao_day_overrides_pkey PRIMARY KEY (id);


--
-- Name: midao_requests midao_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.midao_requests
    ADD CONSTRAINT midao_requests_pkey PRIMARY KEY (id);


--
-- Name: midao_requests midao_requests_request_no_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.midao_requests
    ADD CONSTRAINT midao_requests_request_no_key UNIQUE (request_no);


--
-- Name: notification_event_settings_audit notification_event_settings_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_event_settings_audit
    ADD CONSTRAINT notification_event_settings_audit_pkey PRIMARY KEY (id);


--
-- Name: notification_event_settings notification_event_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_event_settings
    ADD CONSTRAINT notification_event_settings_pkey PRIMARY KEY (id);


--
-- Name: operations_tracking operations_tracking_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.operations_tracking
    ADD CONSTRAINT operations_tracking_order_id_key UNIQUE (order_id);


--
-- Name: operations_tracking operations_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.operations_tracking
    ADD CONSTRAINT operations_tracking_pkey PRIMARY KEY (id);


--
-- Name: order_addons order_addons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_addons
    ADD CONSTRAINT order_addons_pkey PRIMARY KEY (id);


--
-- Name: order_events order_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_events
    ADD CONSTRAINT order_events_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_messages order_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_messages
    ADD CONSTRAINT order_messages_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: package_activities package_activities_package_id_activity_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_activities
    ADD CONSTRAINT package_activities_package_id_activity_id_key UNIQUE (package_id, activity_id);


--
-- Name: package_activities package_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_activities
    ADD CONSTRAINT package_activities_pkey PRIMARY KEY (id);


--
-- Name: payment_booking_mismatch_governance payment_booking_mismatch_governance_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_booking_mismatch_governance
    ADD CONSTRAINT payment_booking_mismatch_governance_payment_id_key UNIQUE (payment_id);


--
-- Name: payment_booking_mismatch_governance payment_booking_mismatch_governance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_booking_mismatch_governance
    ADD CONSTRAINT payment_booking_mismatch_governance_pkey PRIMARY KEY (id);


--
-- Name: payment_events payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_pkey PRIMARY KEY (id);


--
-- Name: payment_logs payment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_logs
    ADD CONSTRAINT payment_logs_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payout_items payout_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_items
    ADD CONSTRAINT payout_items_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: promo_codes promo_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_code_unique UNIQUE (code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: promo_redemptions promo_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_pkey PRIMARY KEY (id);


--
-- Name: promo_redemptions promo_redemptions_user_id_promo_code_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_user_id_promo_code_id_key UNIQUE (user_id, promo_code_id);


--
-- Name: refund_policies refund_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refund_policies
    ADD CONSTRAINT refund_policies_pkey PRIMARY KEY (id);


--
-- Name: refund_policies refund_policies_version_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refund_policies
    ADD CONSTRAINT refund_policies_version_key UNIQUE (version);


--
-- Name: refund_requests refund_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT refund_requests_pkey PRIMARY KEY (id);


--
-- Name: reschedule_requests reschedule_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reschedule_requests
    ADD CONSTRAINT reschedule_requests_pkey PRIMARY KEY (id);


--
-- Name: review_invitations review_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.review_invitations
    ADD CONSTRAINT review_invitations_pkey PRIMARY KEY (id);


--
-- Name: settlement_rules settlement_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settlement_rules
    ADD CONSTRAINT settlement_rules_pkey PRIMARY KEY (id);


--
-- Name: soft_launch_control_audit soft_launch_control_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.soft_launch_control_audit
    ADD CONSTRAINT soft_launch_control_audit_pkey PRIMARY KEY (id);


--
-- Name: soft_launch_controls soft_launch_controls_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.soft_launch_controls
    ADD CONSTRAINT soft_launch_controls_pkey PRIMARY KEY (id);


--
-- Name: soft_launch_whitelist soft_launch_whitelist_entry_type_value_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.soft_launch_whitelist
    ADD CONSTRAINT soft_launch_whitelist_entry_type_value_key UNIQUE (entry_type, value);


--
-- Name: soft_launch_whitelist soft_launch_whitelist_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.soft_launch_whitelist
    ADD CONSTRAINT soft_launch_whitelist_pkey PRIMARY KEY (id);


--
-- Name: telegram_bind_code telegram_bind_code_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telegram_bind_code
    ADD CONSTRAINT telegram_bind_code_pkey PRIMARY KEY (code);


--
-- Name: telegram_chat_mapping telegram_chat_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telegram_chat_mapping
    ADD CONSTRAINT telegram_chat_mapping_pkey PRIMARY KEY (id);


--
-- Name: telegram_chat_mapping telegram_chat_mapping_role_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telegram_chat_mapping
    ADD CONSTRAINT telegram_chat_mapping_role_subject_id_key UNIQUE (role, subject_id);


--
-- Name: telegram_webhook_events telegram_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telegram_webhook_events
    ADD CONSTRAINT telegram_webhook_events_pkey PRIMARY KEY (update_id);


--
-- Name: tour_reminder_log tour_reminder_log_order_id_reminder_kind_channel_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tour_reminder_log
    ADD CONSTRAINT tour_reminder_log_order_id_reminder_kind_channel_key UNIQUE (order_id, reminder_kind, channel);


--
-- Name: tour_reminder_log tour_reminder_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tour_reminder_log
    ADD CONSTRAINT tour_reminder_log_pkey PRIMARY KEY (id);


--
-- Name: traveler_profiles traveler_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.traveler_profiles
    ADD CONSTRAINT traveler_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: user_notifications user_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);


--
-- Name: user_points_ledger user_points_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_points_ledger
    ADD CONSTRAINT user_points_ledger_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wishlists wishlists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_pkey PRIMARY KEY (id);


--
-- Name: wishlists wishlists_user_activity_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_user_activity_unique UNIQUE (user_id, activity_id);


--
-- Name: activities_category_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activities_category_idx ON public.activities USING btree (category);


--
-- Name: activities_guide_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activities_guide_id_idx ON public.activities USING btree (guide_id);


--
-- Name: activities_guide_slug_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activities_guide_slug_idx ON public.activities USING btree (guide_slug);


--
-- Name: activities_published_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activities_published_idx ON public.activities USING btree (region, category, published_at DESC) WHERE (status = 'published'::text);


--
-- Name: activities_region_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activities_region_idx ON public.activities USING btree (region);


--
-- Name: activities_regions_gin_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activities_regions_gin_idx ON public.activities USING gin (regions jsonb_path_ops);


--
-- Name: activity_availability_daily_all_plan_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX activity_availability_daily_all_plan_unique_idx ON public.activity_availability_daily USING btree (activity_id, date) WHERE (plan_id IS NULL);


--
-- Name: activity_availability_daily_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_availability_daily_date_idx ON public.activity_availability_daily USING btree (date, is_open);


--
-- Name: activity_availability_daily_lookup_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_availability_daily_lookup_idx ON public.activity_availability_daily USING btree (activity_id, date, is_open);


--
-- Name: activity_availability_daily_plan_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX activity_availability_daily_plan_unique_idx ON public.activity_availability_daily USING btree (activity_id, date, plan_id) WHERE (plan_id IS NOT NULL);


--
-- Name: activity_schedules_activity_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_schedules_activity_id_idx ON public.activity_schedules USING btree (activity_id);


--
-- Name: activity_schedules_open_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_schedules_open_idx ON public.activity_schedules USING btree (activity_id, start_at) WHERE (status = 'open'::text);


--
-- Name: activity_schedules_start_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_schedules_start_at_idx ON public.activity_schedules USING btree (start_at);


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);


--
-- Name: audit_logs_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_order_id_idx ON public.audit_logs USING btree (order_id);


--
-- Name: events_activity_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_activity_id_idx ON public.events USING btree (activity_id);


--
-- Name: events_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_created_at_idx ON public.events USING btree (created_at DESC);


--
-- Name: events_event_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_event_name_idx ON public.events USING btree (event_name);


--
-- Name: events_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_order_id_idx ON public.events USING btree (order_id);


--
-- Name: events_session_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_session_id_idx ON public.events USING btree (session_id);


--
-- Name: events_utm_campaign_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_utm_campaign_idx ON public.events USING btree (utm_campaign) WHERE (utm_campaign IS NOT NULL);


--
-- Name: events_utm_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX events_utm_source_idx ON public.events USING btree (utm_source) WHERE (utm_source IS NOT NULL);


--
-- Name: guide_applications_pending_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX guide_applications_pending_idx ON public.guide_applications USING btree (created_at DESC) WHERE (status = 'pending'::text);


--
-- Name: guide_profiles_approved_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX guide_profiles_approved_idx ON public.guide_profiles USING btree (slug) WHERE (verification_status = 'approved'::text);


--
-- Name: guide_profiles_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX guide_profiles_email_idx ON public.guide_profiles USING btree (guide_email) WHERE (guide_email IS NOT NULL);


--
-- Name: guide_profiles_guide_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX guide_profiles_guide_email_idx ON public.guide_profiles USING btree (guide_email) WHERE (guide_email IS NOT NULL);


--
-- Name: guide_profiles_invite_token_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX guide_profiles_invite_token_idx ON public.guide_profiles USING btree (invite_token) WHERE (invite_token IS NOT NULL);


--
-- Name: guide_profiles_region_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX guide_profiles_region_idx ON public.guide_profiles USING btree (region);


--
-- Name: guide_profiles_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX guide_profiles_user_id_idx ON public.guide_profiles USING btree (user_id);


--
-- Name: guide_trip_reports_booking_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX guide_trip_reports_booking_id_idx ON public.guide_trip_reports USING btree (booking_id);


--
-- Name: guide_trip_reports_booking_submitted_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX guide_trip_reports_booking_submitted_unique ON public.guide_trip_reports USING btree (booking_id) WHERE (status = 'submitted'::text);


--
-- Name: guide_trip_reports_guide_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX guide_trip_reports_guide_id_idx ON public.guide_trip_reports USING btree (guide_id);


--
-- Name: idx_activities_review_state; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activities_review_state ON public.activities USING btree (review_state) WHERE (review_state IS NOT NULL);


--
-- Name: idx_activity_addons_activity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_addons_activity ON public.activity_addons USING btree (activity_id, sort_order);


--
-- Name: idx_activity_images_activity_id_sort_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_images_activity_id_sort_order ON public.activity_images USING btree (activity_id, sort_order);


--
-- Name: idx_activity_packages_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_packages_is_active ON public.activity_packages USING btree (is_active);


--
-- Name: idx_activity_plan_seasons_plan_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_plan_seasons_plan_active ON public.activity_plan_seasons USING btree (activity_plan_id, is_active);


--
-- Name: idx_activity_plan_seasons_plan_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_plan_seasons_plan_id ON public.activity_plan_seasons USING btree (activity_plan_id);


--
-- Name: idx_activity_plan_tiers_plan_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_plan_tiers_plan_id ON public.activity_plan_tiers USING btree (plan_id);


--
-- Name: idx_activity_plans_activity_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_plans_activity_id ON public.activity_plans USING btree (activity_id);


--
-- Name: idx_activity_plans_activity_legacy_plan_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_plans_activity_legacy_plan_id ON public.activity_plans USING btree (activity_id, legacy_plan_id);


--
-- Name: idx_activity_plans_review_state; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_plans_review_state ON public.activity_plans USING btree (review_state) WHERE (review_state IS NOT NULL);


--
-- Name: idx_activity_plans_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_plans_status ON public.activity_plans USING btree (status);


--
-- Name: idx_activity_qa_activity_id_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_qa_activity_id_status ON public.activity_qa USING btree (activity_id, status);


--
-- Name: idx_activity_reviews_slug_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_reviews_slug_status ON public.activity_reviews USING btree (activity_slug, status);


--
-- Name: idx_booking_status_history_booking_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_booking_status_history_booking_id ON public.booking_status_history USING btree (booking_id);


--
-- Name: idx_booking_status_history_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_booking_status_history_created_at ON public.booking_status_history USING btree (created_at);


--
-- Name: idx_booking_status_logs_booking_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_booking_status_logs_booking_id ON public.booking_status_logs USING btree (booking_id);


--
-- Name: idx_booking_status_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_booking_status_logs_created_at ON public.booking_status_logs USING btree (created_at DESC);


--
-- Name: idx_bookings_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_active ON public.bookings USING btree (guide_id, start_at) WHERE (status = ANY (ARRAY['draft'::text, 'pending_confirmation'::text, 'confirmed'::text, 'reschedule_requested'::text]));


--
-- Name: idx_bookings_activity_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_activity_id ON public.bookings USING btree (activity_id);


--
-- Name: idx_bookings_conflict_override_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_conflict_override_id ON public.bookings USING btree (conflict_override_id) WHERE (conflict_override_id IS NOT NULL);


--
-- Name: idx_bookings_guide_approval_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_guide_approval_status ON public.bookings USING btree (guide_approval_status) WHERE (guide_approval_status = 'pending'::text);


--
-- Name: idx_bookings_guide_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_guide_id ON public.bookings USING btree (guide_id);


--
-- Name: idx_bookings_plan_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_plan_id ON public.bookings USING btree (activity_plan_id);


--
-- Name: idx_bookings_schedule_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_schedule_id ON public.bookings USING btree (schedule_id);


--
-- Name: idx_bookings_start_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_start_at ON public.bookings USING btree (start_at);


--
-- Name: idx_bookings_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);


--
-- Name: idx_bookings_traveler_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_traveler_id ON public.bookings USING btree (traveler_id);


--
-- Name: idx_cron_run_log_job_finished; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cron_run_log_job_finished ON public.cron_run_log USING btree (job_key, finished_at DESC);


--
-- Name: idx_guide_availability_rules_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guide_availability_rules_active ON public.guide_availability_rules USING btree (is_active);


--
-- Name: idx_guide_availability_rules_guide_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guide_availability_rules_guide_id ON public.guide_availability_rules USING btree (guide_id);


--
-- Name: idx_guide_availability_rules_plan_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guide_availability_rules_plan_id ON public.guide_availability_rules USING btree (activity_plan_id);


--
-- Name: idx_guide_blackout_dates_guide_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guide_blackout_dates_guide_id ON public.guide_blackout_dates USING btree (guide_id);


--
-- Name: idx_guide_blackout_dates_starts_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guide_blackout_dates_starts_at ON public.guide_blackout_dates USING btree (starts_at);


--
-- Name: idx_guide_line_bind_code_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guide_line_bind_code_expires_at ON public.guide_line_bind_code USING btree (expires_at);


--
-- Name: idx_guide_line_bind_code_guide_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guide_line_bind_code_guide_id ON public.guide_line_bind_code USING btree (guide_id);


--
-- Name: idx_guide_slot_conflict_overrides_exact_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guide_slot_conflict_overrides_exact_active ON public.guide_slot_conflict_overrides USING btree (guide_id, activity_id, activity_plan_id, start_at, end_at) WHERE (status = 'active'::text);


--
-- Name: idx_guide_slot_conflict_overrides_plan_date_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_guide_slot_conflict_overrides_plan_date_active ON public.guide_slot_conflict_overrides USING btree (activity_plan_id, start_at, end_at) WHERE (status = 'active'::text);


--
-- Name: idx_incidents_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_incidents_created_at ON public.incidents USING btree (created_at DESC);


--
-- Name: idx_incidents_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_incidents_severity ON public.incidents USING btree (severity);


--
-- Name: idx_incidents_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_incidents_source ON public.incidents USING btree (source);


--
-- Name: idx_lbc_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lbc_email ON public.line_bind_code USING btree (lower(contact_email)) WHERE (contact_email IS NOT NULL);


--
-- Name: idx_lbc_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lbc_user_id ON public.line_bind_code USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_line_user_mapping_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_line_user_mapping_email ON public.line_user_mapping USING btree (lower(contact_email)) WHERE (contact_email IS NOT NULL);


--
-- Name: idx_line_user_mapping_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_line_user_mapping_user_id ON public.line_user_mapping USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_line_webhook_events_received_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_line_webhook_events_received_at ON public.line_webhook_events USING btree (received_at DESC);


--
-- Name: idx_midao_day_overrides_guide_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_midao_day_overrides_guide_date ON public.midao_day_overrides USING btree (guide_id, date);


--
-- Name: idx_midao_requests_guide_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_midao_requests_guide_date ON public.midao_requests USING btree (guide_id, preferred_date);


--
-- Name: idx_midao_requests_guide_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_midao_requests_guide_status ON public.midao_requests USING btree (guide_id, status);


--
-- Name: idx_order_addons_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_addons_order ON public.order_addons USING btree (order_id);


--
-- Name: idx_order_items_booking_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_booking_id ON public.order_items USING btree (booking_id) WHERE (booking_id IS NOT NULL);


--
-- Name: idx_order_items_item_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_item_type ON public.order_items USING btree (item_type);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_order_messages_order_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_messages_order_created ON public.order_messages USING btree (order_id, created_at);


--
-- Name: idx_orders_booking_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_booking_id ON public.orders USING btree (booking_id);


--
-- Name: idx_orders_booking_no_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_orders_booking_no_unique ON public.orders USING btree (booking_no);


--
-- Name: idx_orders_payment_deadline_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_payment_deadline_pending ON public.orders USING btree (payment_deadline_at) WHERE ((status = 'pending_payment'::text) AND (payment_deadline_at IS NOT NULL));


--
-- Name: idx_orders_payment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_payment_status ON public.orders USING btree (payment_status);


--
-- Name: idx_orders_source_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_source_channel ON public.orders USING btree (source_channel);


--
-- Name: idx_package_activities_activity_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_package_activities_activity_id ON public.package_activities USING btree (activity_id);


--
-- Name: idx_package_activities_package_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_package_activities_package_id ON public.package_activities USING btree (package_id);


--
-- Name: idx_payment_events_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_events_created_at ON public.payment_events USING btree (created_at DESC);


--
-- Name: idx_payment_events_merchant_trade_no; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_events_merchant_trade_no ON public.payment_events USING btree (merchant_trade_no) WHERE (merchant_trade_no IS NOT NULL);


--
-- Name: idx_payment_events_order_created_at_desc; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_events_order_created_at_desc ON public.payment_events USING btree (order_id, created_at DESC);


--
-- Name: idx_payment_events_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_events_order_id ON public.payment_events USING btree (order_id);


--
-- Name: idx_payment_events_payment_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_events_payment_id ON public.payment_events USING btree (payment_id);


--
-- Name: idx_payment_events_provider; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_events_provider ON public.payment_events USING btree (provider);


--
-- Name: idx_payment_events_trade_no; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_events_trade_no ON public.payment_events USING btree (trade_no) WHERE (trade_no IS NOT NULL);


--
-- Name: idx_payment_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_logs_created_at ON public.payment_logs USING btree (created_at);


--
-- Name: idx_payment_logs_payment_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_logs_payment_id ON public.payment_logs USING btree (payment_id);


--
-- Name: idx_payments_booking_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_booking_id ON public.payments USING btree (booking_id);


--
-- Name: idx_payments_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_created_at ON public.payments USING btree (created_at);


--
-- Name: idx_payments_merchant_trade_no; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_merchant_trade_no ON public.payments USING btree (merchant_trade_no);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_pbmg_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pbmg_order_id ON public.payment_booking_mismatch_governance USING btree (order_id);


--
-- Name: idx_pbmg_status_label; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pbmg_status_label ON public.payment_booking_mismatch_governance USING btree (governance_status, legacy_label);


--
-- Name: idx_points_ledger_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_points_ledger_user ON public.user_points_ledger USING btree (user_id, created_at);


--
-- Name: idx_reviews_activity_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reviews_activity_slug ON public.activity_reviews USING btree (activity_slug);


--
-- Name: idx_reviews_guide_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reviews_guide_slug ON public.activity_reviews USING btree (guide_slug);


--
-- Name: idx_schedules_activity_plan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_schedules_activity_plan ON public.activity_schedules USING btree (activity_id, plan_id);


--
-- Name: idx_schedules_unique_date_plan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_schedules_unique_date_plan ON public.activity_schedules USING btree (activity_id, COALESCE(plan_id, '__all__'::text), public.fn_schedule_date(start_at));


--
-- Name: idx_telegram_bind_code_subject; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_telegram_bind_code_subject ON public.telegram_bind_code USING btree (role, subject_id);


--
-- Name: idx_telegram_chat_mapping_chat; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_telegram_chat_mapping_chat ON public.telegram_chat_mapping USING btree (chat_id);


--
-- Name: idx_telegram_chat_mapping_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_telegram_chat_mapping_email ON public.telegram_chat_mapping USING btree (lower(contact_email)) WHERE (contact_email IS NOT NULL);


--
-- Name: idx_tour_reminder_log_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tour_reminder_log_created_at ON public.tour_reminder_log USING btree (created_at DESC);


--
-- Name: idx_tour_reminder_log_kind_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tour_reminder_log_kind_channel ON public.tour_reminder_log USING btree (reminder_kind, channel);


--
-- Name: idx_tour_reminder_log_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tour_reminder_log_order_id ON public.tour_reminder_log USING btree (order_id);


--
-- Name: idx_tour_reminder_log_schedule_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tour_reminder_log_schedule_id ON public.tour_reminder_log USING btree (schedule_id);


--
-- Name: idx_user_notifications_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_notifications_unread ON public.user_notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: idx_user_notifications_user_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_notifications_user_created ON public.user_notifications USING btree (user_id, created_at DESC);


--
-- Name: orders_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_active_idx ON public.orders USING btree (created_at DESC) WHERE (status = ANY (ARRAY['pending_payment'::text, 'paid'::text, 'confirmed'::text, 'refund_pending'::text]));


--
-- Name: orders_activity_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_activity_id_idx ON public.orders USING btree (activity_id);


--
-- Name: orders_contact_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_contact_email_idx ON public.orders USING btree (contact_email);


--
-- Name: orders_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC);


--
-- Name: orders_schedule_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_schedule_id_idx ON public.orders USING btree (schedule_id);


--
-- Name: orders_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_user_id_idx ON public.orders USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: payment_events_provider_event_idempotent_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX payment_events_provider_event_idempotent_unique ON public.payment_events USING btree (provider, event_type, order_id, COALESCE(merchant_trade_no, ''::text), COALESCE(trade_no, ''::text)) WHERE (event_type = ANY (ARRAY['callback_paid'::text, 'provider_reconciled_paid'::text, 'authorization_voided'::text, 'refunded'::text]));


--
-- Name: payments_order_id_created_at_desc_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payments_order_id_created_at_desc_idx ON public.payments USING btree (order_id, created_at DESC);


--
-- Name: payments_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payments_order_id_idx ON public.payments USING btree (order_id);


--
-- Name: payments_paid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payments_paid_idx ON public.payments USING btree (paid_at DESC) WHERE (status = 'paid'::text);


--
-- Name: payments_provider_merchant_trade_no_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX payments_provider_merchant_trade_no_unique ON public.payments USING btree (provider, merchant_trade_no) WHERE (merchant_trade_no IS NOT NULL);


--
-- Name: payments_provider_trade_no_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX payments_provider_trade_no_unique ON public.payments USING btree (provider, trade_no) WHERE (trade_no IS NOT NULL);


--
-- Name: payout_items_order_kind_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX payout_items_order_kind_unique ON public.payout_items USING btree (order_id, settlement_kind);


--
-- Name: payouts_pending_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX payouts_pending_unique ON public.payouts USING btree (guide_id) WHERE (state = 'pending'::text);


--
-- Name: promo_codes_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX promo_codes_active_idx ON public.promo_codes USING btree (active);


--
-- Name: promo_codes_code_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX promo_codes_code_idx ON public.promo_codes USING btree (code);


--
-- Name: promo_codes_public_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX promo_codes_public_active_idx ON public.promo_codes USING btree (is_public, active) WHERE (is_public = true);


--
-- Name: promo_redemptions_promo_code_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX promo_redemptions_promo_code_id_idx ON public.promo_redemptions USING btree (promo_code_id);


--
-- Name: promo_redemptions_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX promo_redemptions_user_id_idx ON public.promo_redemptions USING btree (user_id);


--
-- Name: refund_policies_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX refund_policies_active_unique ON public.refund_policies USING btree (is_active) WHERE (is_active = true);


--
-- Name: refund_requests_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX refund_requests_active_idx ON public.refund_requests USING btree (requested_at DESC) WHERE (status = ANY (ARRAY['requested'::text, 'reviewing'::text, 'approved'::text, 'processing'::text]));


--
-- Name: refund_requests_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX refund_requests_order_id_idx ON public.refund_requests USING btree (order_id);


--
-- Name: refund_requests_order_request_id_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX refund_requests_order_request_id_unique ON public.refund_requests USING btree (order_id, request_id) WHERE (request_id IS NOT NULL);


--
-- Name: refund_requests_request_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX refund_requests_request_id_idx ON public.refund_requests USING btree (request_id) WHERE (request_id IS NOT NULL);


--
-- Name: reschedule_requests_order_request_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX reschedule_requests_order_request_unique ON public.reschedule_requests USING btree (order_id, request_id);


--
-- Name: reschedule_requests_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX reschedule_requests_status_idx ON public.reschedule_requests USING btree (status, requested_at DESC);


--
-- Name: review_invitations_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX review_invitations_order_id_idx ON public.review_invitations USING btree (order_id);


--
-- Name: review_invitations_sent_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX review_invitations_sent_unique ON public.review_invitations USING btree (order_id, invitation_kind, channel) WHERE (status = 'sent'::text);


--
-- Name: settlement_rules_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX settlement_rules_active_unique ON public.settlement_rules USING btree (is_active) WHERE (is_active = true);


--
-- Name: uq_midao_day_overrides_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_midao_day_overrides_period ON public.midao_day_overrides USING btree (guide_id, date, period) WHERE (period <> 'custom'::text);


--
-- Name: uq_points_earn_per_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_points_earn_per_order ON public.user_points_ledger USING btree (order_id, reason) WHERE (reason = ANY (ARRAY['earn_order'::text, 'redeem_order'::text]));


--
-- Name: wishlists_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wishlists_user_id_idx ON public.wishlists USING btree (user_id);


--
-- Name: activity_plans activity_plans_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER activity_plans_updated_at BEFORE UPDATE ON public.activity_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bookings bookings_generate_booking_no; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER bookings_generate_booking_no BEFORE INSERT ON public.bookings FOR EACH ROW WHEN (((new.booking_no IS NULL) OR (new.booking_no = ''::text))) EXECUTE FUNCTION public.generate_booking_no();


--
-- Name: bookings bookings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: guide_availability_rules guide_availability_rules_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guide_availability_rules_updated_at BEFORE UPDATE ON public.guide_availability_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: activity_qa trg_activity_qa_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_activity_qa_updated_at BEFORE UPDATE ON public.activity_qa FOR EACH ROW EXECUTE FUNCTION public.set_activity_qa_updated_at();


--
-- Name: admin_security trg_admin_security_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_admin_security_updated_at BEFORE UPDATE ON public.admin_security FOR EACH ROW EXECUTE FUNCTION public.set_admin_security_updated_at();


--
-- Name: activity_schedules trg_auto_full_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_auto_full_status BEFORE UPDATE OF booked_count ON public.activity_schedules FOR EACH ROW EXECUTE FUNCTION public.fn_auto_full_status();


--
-- Name: payment_booking_mismatch_governance trg_payment_booking_mismatch_governance_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_payment_booking_mismatch_governance_updated_at BEFORE UPDATE ON public.payment_booking_mismatch_governance FOR EACH ROW EXECUTE FUNCTION public.set_payment_booking_mismatch_governance_updated_at();


--
-- Name: activity_schedules trg_refresh_activity_availability_daily; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_refresh_activity_availability_daily AFTER INSERT OR DELETE OR UPDATE ON public.activity_schedules FOR EACH ROW EXECUTE FUNCTION public.fn_refresh_activity_availability_daily_by_schedule_change();


--
-- Name: orders trg_set_order_booking_no; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_set_order_booking_no BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_order_booking_no();


--
-- Name: activity_packages update_activity_packages_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_activity_packages_updated_at BEFORE UPDATE ON public.activity_packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: activities activities_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE SET NULL;


--
-- Name: activity_addons activity_addons_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_addons
    ADD CONSTRAINT activity_addons_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: activity_availability_daily activity_availability_daily_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_availability_daily
    ADD CONSTRAINT activity_availability_daily_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: activity_images activity_images_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_images
    ADD CONSTRAINT activity_images_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: activity_plan_seasons activity_plan_seasons_activity_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_plan_seasons
    ADD CONSTRAINT activity_plan_seasons_activity_plan_id_fkey FOREIGN KEY (activity_plan_id) REFERENCES public.activity_plans(id) ON DELETE CASCADE;


--
-- Name: activity_plan_tiers activity_plan_tiers_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_plan_tiers
    ADD CONSTRAINT activity_plan_tiers_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.activity_plans(id) ON DELETE CASCADE;


--
-- Name: activity_plans activity_plans_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_plans
    ADD CONSTRAINT activity_plans_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: activity_schedules activity_schedules_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_schedules
    ADD CONSTRAINT activity_schedules_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: booking_status_history booking_status_history_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_status_history
    ADD CONSTRAINT booking_status_history_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_status_history booking_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_status_history
    ADD CONSTRAINT booking_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);


--
-- Name: booking_status_logs booking_status_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_status_logs
    ADD CONSTRAINT booking_status_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id);


--
-- Name: booking_status_logs booking_status_logs_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_status_logs
    ADD CONSTRAINT booking_status_logs_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id);


--
-- Name: bookings bookings_activity_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_activity_plan_id_fkey FOREIGN KEY (activity_plan_id) REFERENCES public.activity_plans(id);


--
-- Name: bookings bookings_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id);


--
-- Name: bookings bookings_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.activity_schedules(id);


--
-- Name: bookings bookings_traveler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_traveler_id_fkey FOREIGN KEY (traveler_id) REFERENCES public.users(id);


--
-- Name: events events_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE SET NULL;


--
-- Name: events events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: events events_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.activity_schedules(id) ON DELETE SET NULL;


--
-- Name: experiences experiences_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.experiences
    ADD CONSTRAINT experiences_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id);


--
-- Name: bookings fk_bookings_order_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT fk_bookings_order_id FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: order_items fk_order_items_booking_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT fk_order_items_booking_id FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;


--
-- Name: payments fk_payments_booking_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT fk_payments_booking_id FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: guide_availability_rules guide_availability_rules_activity_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_availability_rules
    ADD CONSTRAINT guide_availability_rules_activity_plan_id_fkey FOREIGN KEY (activity_plan_id) REFERENCES public.activity_plans(id) ON DELETE CASCADE;


--
-- Name: guide_availability_rules guide_availability_rules_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_availability_rules
    ADD CONSTRAINT guide_availability_rules_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE CASCADE;


--
-- Name: guide_balances guide_balances_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_balances
    ADD CONSTRAINT guide_balances_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE CASCADE;


--
-- Name: guide_blackout_dates guide_blackout_dates_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_blackout_dates
    ADD CONSTRAINT guide_blackout_dates_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE CASCADE;


--
-- Name: guide_line_bind_code guide_line_bind_code_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_line_bind_code
    ADD CONSTRAINT guide_line_bind_code_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE CASCADE;


--
-- Name: guide_line_mapping guide_line_mapping_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_line_mapping
    ADD CONSTRAINT guide_line_mapping_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE CASCADE;


--
-- Name: guide_profiles guide_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_profiles
    ADD CONSTRAINT guide_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: guide_slot_conflict_overrides guide_slot_conflict_overrides_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_slot_conflict_overrides
    ADD CONSTRAINT guide_slot_conflict_overrides_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: guide_slot_conflict_overrides guide_slot_conflict_overrides_activity_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_slot_conflict_overrides
    ADD CONSTRAINT guide_slot_conflict_overrides_activity_plan_id_fkey FOREIGN KEY (activity_plan_id) REFERENCES public.activity_plans(id) ON DELETE CASCADE;


--
-- Name: guide_slot_conflict_overrides guide_slot_conflict_overrides_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_slot_conflict_overrides
    ADD CONSTRAINT guide_slot_conflict_overrides_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE CASCADE;


--
-- Name: guide_trip_reports guide_trip_reports_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_trip_reports
    ADD CONSTRAINT guide_trip_reports_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: guide_trip_reports guide_trip_reports_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.guide_trip_reports
    ADD CONSTRAINT guide_trip_reports_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE CASCADE;


--
-- Name: line_bind_code line_bind_code_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.line_bind_code
    ADD CONSTRAINT line_bind_code_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: line_user_mapping line_user_mapping_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.line_user_mapping
    ADD CONSTRAINT line_user_mapping_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: midao_availability_defaults midao_availability_defaults_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.midao_availability_defaults
    ADD CONSTRAINT midao_availability_defaults_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE CASCADE;


--
-- Name: midao_day_overrides midao_day_overrides_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.midao_day_overrides
    ADD CONSTRAINT midao_day_overrides_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE CASCADE;


--
-- Name: midao_requests midao_requests_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.midao_requests
    ADD CONSTRAINT midao_requests_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE SET NULL;


--
-- Name: midao_requests midao_requests_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.midao_requests
    ADD CONSTRAINT midao_requests_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE CASCADE;


--
-- Name: midao_requests midao_requests_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.midao_requests
    ADD CONSTRAINT midao_requests_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.activity_plans(id) ON DELETE SET NULL;


--
-- Name: operations_tracking operations_tracking_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.operations_tracking
    ADD CONSTRAINT operations_tracking_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_addons order_addons_addon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_addons
    ADD CONSTRAINT order_addons_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES public.activity_addons(id);


--
-- Name: order_addons order_addons_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_addons
    ADD CONSTRAINT order_addons_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_events order_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_events
    ADD CONSTRAINT order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_messages order_messages_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_messages
    ADD CONSTRAINT order_messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE SET NULL;


--
-- Name: orders orders_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: orders orders_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.users(id);


--
-- Name: orders orders_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.activity_schedules(id) ON DELETE SET NULL;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: package_activities package_activities_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_activities
    ADD CONSTRAINT package_activities_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: package_activities package_activities_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_activities
    ADD CONSTRAINT package_activities_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.activity_packages(id) ON DELETE CASCADE;


--
-- Name: payment_events payment_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: payment_events payment_events_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payment_logs payment_logs_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_logs
    ADD CONSTRAINT payment_logs_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: payout_items payout_items_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_items
    ADD CONSTRAINT payout_items_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE RESTRICT;


--
-- Name: payout_items payout_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_items
    ADD CONSTRAINT payout_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;


--
-- Name: payouts payouts_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guide_profiles(id) ON DELETE RESTRICT;


--
-- Name: promo_redemptions promo_redemptions_promo_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id) ON DELETE CASCADE;


--
-- Name: refund_requests refund_requests_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT refund_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: reschedule_requests reschedule_requests_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reschedule_requests
    ADD CONSTRAINT reschedule_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: review_invitations review_invitations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.review_invitations
    ADD CONSTRAINT review_invitations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: traveler_profiles traveler_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.traveler_profiles
    ADD CONSTRAINT traveler_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_notifications user_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_points_ledger user_points_ledger_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_points_ledger
    ADD CONSTRAINT user_points_ledger_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: user_points_ledger user_points_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_points_ledger
    ADD CONSTRAINT user_points_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wishlists wishlists_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: wishlists wishlists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: activity_packages Activity packages are manageable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Activity packages are manageable by authenticated users" ON public.activity_packages USING ((auth.role() = 'authenticated'::text));


--
-- Name: activity_packages Activity packages are viewable by everyone; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Activity packages are viewable by everyone" ON public.activity_packages FOR SELECT USING (true);


--
-- Name: activity_plan_seasons Activity plan seasons mutate for service role; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Activity plan seasons mutate for service role" ON public.activity_plan_seasons TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_plan_seasons Activity plan seasons read for anonymous; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Activity plan seasons read for anonymous" ON public.activity_plan_seasons FOR SELECT TO anon USING (is_active);


--
-- Name: activity_plan_seasons Activity plan seasons read for authenticated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Activity plan seasons read for authenticated" ON public.activity_plan_seasons FOR SELECT TO authenticated USING (true);


--
-- Name: booking_status_history Booking status history insertable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Booking status history insertable by authenticated users" ON public.booking_status_history FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: booking_status_history Booking status history viewable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Booking status history viewable by authenticated users" ON public.booking_status_history FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: guide_slot_conflict_overrides Guide slot conflict overrides mutate for service role; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Guide slot conflict overrides mutate for service role" ON public.guide_slot_conflict_overrides TO service_role USING (true) WITH CHECK (true);


--
-- Name: package_activities Package activities are manageable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Package activities are manageable by authenticated users" ON public.package_activities USING ((auth.role() = 'authenticated'::text));


--
-- Name: package_activities Package activities are viewable by everyone; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Package activities are viewable by everyone" ON public.package_activities FOR SELECT USING (true);


--
-- Name: payment_logs Payment logs insertable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Payment logs insertable by authenticated users" ON public.payment_logs FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: payment_logs Payment logs viewable by authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Payment logs viewable by authenticated users" ON public.payment_logs FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: users Users can update their own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: users Users can view their own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own profile" ON public.users FOR SELECT USING ((auth.uid() = id));


--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: activities activities: guide insert own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activities: guide insert own" ON public.activities FOR INSERT WITH CHECK ((guide_id = ( SELECT guide_profiles.id
   FROM public.guide_profiles
  WHERE (guide_profiles.user_id = auth.uid()))));


--
-- Name: activities activities: guide select own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activities: guide select own" ON public.activities FOR SELECT USING ((guide_id = ( SELECT guide_profiles.id
   FROM public.guide_profiles
  WHERE (guide_profiles.user_id = auth.uid()))));


--
-- Name: activities activities: guide update own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activities: guide update own" ON public.activities FOR UPDATE USING ((guide_id = ( SELECT guide_profiles.id
   FROM public.guide_profiles
  WHERE (guide_profiles.user_id = auth.uid())))) WITH CHECK ((guide_id = ( SELECT guide_profiles.id
   FROM public.guide_profiles
  WHERE (guide_profiles.user_id = auth.uid()))));


--
-- Name: activities activities: public read published; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activities: public read published" ON public.activities FOR SELECT USING ((status = 'published'::text));


--
-- Name: activities activities: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activities: service role full access" ON public.activities TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_addons; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_addons ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_addons activity_addons_select_active; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY activity_addons_select_active ON public.activity_addons FOR SELECT TO authenticated, anon USING ((is_active = true));


--
-- Name: activity_addons activity_addons_service_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY activity_addons_service_all ON public.activity_addons TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_availability_daily; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_availability_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_images; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_images ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_images activity_images: guide manage own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activity_images: guide manage own" ON public.activity_images USING ((EXISTS ( SELECT 1
   FROM public.activities a
  WHERE ((a.id = activity_images.activity_id) AND (a.guide_id = ( SELECT guide_profiles.id
           FROM public.guide_profiles
          WHERE (guide_profiles.user_id = auth.uid()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.activities a
  WHERE ((a.id = activity_images.activity_id) AND (a.guide_id = ( SELECT guide_profiles.id
           FROM public.guide_profiles
          WHERE (guide_profiles.user_id = auth.uid())))))));


--
-- Name: activity_images activity_images: public read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activity_images: public read" ON public.activity_images FOR SELECT USING (true);


--
-- Name: activity_images activity_images: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activity_images: service role full access" ON public.activity_images USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: activity_packages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_plan_seasons; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_plan_seasons ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_plan_tiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_plan_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_plan_tiers activity_plan_tiers: guide manage own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activity_plan_tiers: guide manage own" ON public.activity_plan_tiers USING ((EXISTS ( SELECT 1
   FROM (public.activity_plans ap
     JOIN public.activities a ON ((a.id = ap.activity_id)))
  WHERE ((ap.id = activity_plan_tiers.plan_id) AND (a.guide_id = ( SELECT guide_profiles.id
           FROM public.guide_profiles
          WHERE (guide_profiles.user_id = auth.uid()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.activity_plans ap
     JOIN public.activities a ON ((a.id = ap.activity_id)))
  WHERE ((ap.id = activity_plan_tiers.plan_id) AND (a.guide_id = ( SELECT guide_profiles.id
           FROM public.guide_profiles
          WHERE (guide_profiles.user_id = auth.uid())))))));


--
-- Name: activity_plan_tiers activity_plan_tiers: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activity_plan_tiers: service role full access" ON public.activity_plan_tiers USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: activity_plans; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_plans activity_plans: guide manage own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activity_plans: guide manage own" ON public.activity_plans USING ((EXISTS ( SELECT 1
   FROM public.activities a
  WHERE ((a.id = activity_plans.activity_id) AND (a.guide_id = ( SELECT guide_profiles.id
           FROM public.guide_profiles
          WHERE (guide_profiles.user_id = auth.uid()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.activities a
  WHERE ((a.id = activity_plans.activity_id) AND (a.guide_id = ( SELECT guide_profiles.id
           FROM public.guide_profiles
          WHERE (guide_profiles.user_id = auth.uid())))))));


--
-- Name: activity_plans activity_plans: public read active plans; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activity_plans: public read active plans" ON public.activity_plans FOR SELECT USING ((status = 'active'::text));


--
-- Name: activity_plans activity_plans: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activity_plans: service role full access" ON public.activity_plans TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_qa; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_qa ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_reviews; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_schedules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_schedules activity_schedules: guide manage own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activity_schedules: guide manage own" ON public.activity_schedules USING ((EXISTS ( SELECT 1
   FROM public.activities a
  WHERE ((a.id = activity_schedules.activity_id) AND (a.guide_id = ( SELECT guide_profiles.id
           FROM public.guide_profiles
          WHERE (guide_profiles.user_id = auth.uid()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.activities a
  WHERE ((a.id = activity_schedules.activity_id) AND (a.guide_id = ( SELECT guide_profiles.id
           FROM public.guide_profiles
          WHERE (guide_profiles.user_id = auth.uid())))))));


--
-- Name: activity_schedules activity_schedules: public read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activity_schedules: public read" ON public.activity_schedules FOR SELECT USING (true);


--
-- Name: activity_schedules activity_schedules: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activity_schedules: service role full access" ON public.activity_schedules TO service_role USING (true) WITH CHECK (true);


--
-- Name: admin_security; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admin_security ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "audit_logs: service role full access" ON public.audit_logs TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_qa authenticated_insert_pending_qa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY authenticated_insert_pending_qa ON public.activity_qa FOR INSERT TO authenticated WITH CHECK (((status = 'pending_moderation'::text) AND (auth.uid() = user_id)));


--
-- Name: activity_qa authenticated_read_own_qa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY authenticated_read_own_qa ON public.activity_qa FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: booking_status_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_status_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.booking_status_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_status_logs booking_status_logs: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "booking_status_logs: service role full access" ON public.booking_status_logs TO service_role USING (true) WITH CHECK (true);


--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings bookings: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bookings: service role full access" ON public.bookings TO service_role USING (true) WITH CHECK (true);


--
-- Name: cron_job_controls; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.cron_job_controls ENABLE ROW LEVEL SECURITY;

--
-- Name: cron_run_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.cron_run_log ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events events: service_role insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "events: service_role insert" ON public.events FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: events events: service_role select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "events: service_role select" ON public.events FOR SELECT TO service_role USING (true);


--
-- Name: experiences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_applications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.guide_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_applications guide_applications: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guide_applications: service role full access" ON public.guide_applications TO service_role USING (true) WITH CHECK (true);


--
-- Name: guide_availability_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.guide_availability_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_availability_rules guide_availability_rules: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guide_availability_rules: service role full access" ON public.guide_availability_rules TO service_role USING (true) WITH CHECK (true);


--
-- Name: guide_balances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.guide_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_blackout_dates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.guide_blackout_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_blackout_dates guide_blackout_dates: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guide_blackout_dates: service role full access" ON public.guide_blackout_dates TO service_role USING (true) WITH CHECK (true);


--
-- Name: guide_line_bind_code; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.guide_line_bind_code ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_line_bind_code guide_line_bind_code: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guide_line_bind_code: service role full access" ON public.guide_line_bind_code USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: guide_line_mapping; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.guide_line_mapping ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_line_mapping guide_line_mapping: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guide_line_mapping: service role full access" ON public.guide_line_mapping USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: guide_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.guide_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_profiles guide_profiles: public read approved; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guide_profiles: public read approved" ON public.guide_profiles FOR SELECT USING ((verification_status = 'approved'::text));


--
-- Name: guide_profiles guide_profiles: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guide_profiles: service role full access" ON public.guide_profiles TO service_role USING (true) WITH CHECK (true);


--
-- Name: guide_slot_conflict_overrides; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.guide_slot_conflict_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_trip_reports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.guide_trip_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: guide_trip_reports guide_trip_reports: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guide_trip_reports: service role full access" ON public.guide_trip_reports USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: homepage_featured_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.homepage_featured_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_featured_settings homepage_featured_settings: authenticated read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "homepage_featured_settings: authenticated read" ON public.homepage_featured_settings FOR SELECT TO authenticated USING (true);


--
-- Name: homepage_featured_settings homepage_featured_settings: service_role full; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "homepage_featured_settings: service_role full" ON public.homepage_featured_settings TO service_role USING (true) WITH CHECK (true);


--
-- Name: incidents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: incidents incidents: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "incidents: service role full access" ON public.incidents USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: kpi_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.kpi_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_settings kpi_settings: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "kpi_settings: service role full access" ON public.kpi_settings TO service_role USING (true) WITH CHECK (true);


--
-- Name: kpi_settings_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.kpi_settings_history ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_settings_history kpi_settings_history: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "kpi_settings_history: service role full access" ON public.kpi_settings_history TO service_role USING (true) WITH CHECK (true);


--
-- Name: line_bind_code; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.line_bind_code ENABLE ROW LEVEL SECURITY;

--
-- Name: line_bind_code line_bind_code: service_role full; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "line_bind_code: service_role full" ON public.line_bind_code TO service_role USING (true) WITH CHECK (true);


--
-- Name: line_user_mapping; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.line_user_mapping ENABLE ROW LEVEL SECURITY;

--
-- Name: line_user_mapping line_user_mapping: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "line_user_mapping: service role full access" ON public.line_user_mapping USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: line_webhook_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.line_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: line_webhook_events line_webhook_events: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "line_webhook_events: service role full access" ON public.line_webhook_events USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: midao_availability_defaults; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.midao_availability_defaults ENABLE ROW LEVEL SECURITY;

--
-- Name: midao_day_overrides; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.midao_day_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: midao_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.midao_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_event_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notification_event_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_event_settings notification_event_settings: authenticated read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_event_settings: authenticated read" ON public.notification_event_settings FOR SELECT TO authenticated USING (true);


--
-- Name: notification_event_settings notification_event_settings: service_role full; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_event_settings: service_role full" ON public.notification_event_settings TO service_role USING (true) WITH CHECK (true);


--
-- Name: notification_event_settings_audit; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notification_event_settings_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_event_settings_audit notification_event_settings_audit: authenticated read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_event_settings_audit: authenticated read" ON public.notification_event_settings_audit FOR SELECT TO authenticated USING (true);


--
-- Name: notification_event_settings_audit notification_event_settings_audit: service_role full; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_event_settings_audit: service_role full" ON public.notification_event_settings_audit TO service_role USING (true) WITH CHECK (true);


--
-- Name: operations_tracking; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.operations_tracking ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_tracking operations_tracking: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "operations_tracking: service role full access" ON public.operations_tracking TO service_role USING (true) WITH CHECK (true);


--
-- Name: order_addons; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.order_addons ENABLE ROW LEVEL SECURITY;

--
-- Name: order_addons order_addons_service_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY order_addons_service_all ON public.order_addons TO service_role USING (true) WITH CHECK (true);


--
-- Name: order_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "order_items: service role full access" ON public.order_items TO service_role USING (true) WITH CHECK (true);


--
-- Name: order_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "orders: service role full access" ON public.orders TO service_role USING (true) WITH CHECK (true);


--
-- Name: package_activities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.package_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_booking_mismatch_governance; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payment_booking_mismatch_governance ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_events payment_events: service_role only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payment_events: service_role only" ON public.payment_events TO service_role USING (true) WITH CHECK (true);


--
-- Name: payment_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments: service_role only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payments: service_role only" ON public.payments TO service_role USING (true) WITH CHECK (true);


--
-- Name: payout_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payout_items ENABLE ROW LEVEL SECURITY;

--
-- Name: payouts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_points_ledger points_ledger_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY points_ledger_select_own ON public.user_points_ledger FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_points_ledger points_ledger_service_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY points_ledger_service_all ON public.user_points_ledger TO service_role USING (true) WITH CHECK (true);


--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes promo_codes: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "promo_codes: service role full access" ON public.promo_codes USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: promo_redemptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_redemptions promo_redemptions: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "promo_redemptions: service role full access" ON public.promo_redemptions USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: activity_qa public_read_approved_qa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read_approved_qa ON public.activity_qa FOR SELECT USING ((status = 'approved'::text));


--
-- Name: activity_reviews public_read_approved_reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY public_read_approved_reviews ON public.activity_reviews FOR SELECT USING ((status = 'approved'::text));


--
-- Name: refund_policies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.refund_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: refund_policies refund_policies_service_role; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY refund_policies_service_role ON public.refund_policies USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: refund_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: refund_requests refund_requests: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "refund_requests: service role full access" ON public.refund_requests TO service_role USING (true) WITH CHECK (true);


--
-- Name: reschedule_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.reschedule_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: reschedule_requests reschedule_requests_service_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY reschedule_requests_service_all ON public.reschedule_requests USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: review_invitations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.review_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: review_invitations review_invitations: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "review_invitations: service role full access" ON public.review_invitations USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: guide_balances service_role_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all ON public.guide_balances TO service_role USING (true) WITH CHECK (true);


--
-- Name: payout_items service_role_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all ON public.payout_items TO service_role USING (true) WITH CHECK (true);


--
-- Name: payouts service_role_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all ON public.payouts TO service_role USING (true) WITH CHECK (true);


--
-- Name: settlement_rules service_role_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all ON public.settlement_rules TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_availability_daily service_role_all_activity_availability_daily; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_activity_availability_daily ON public.activity_availability_daily TO service_role USING (true) WITH CHECK (true);


--
-- Name: admin_security service_role_all_admin_security; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_admin_security ON public.admin_security TO service_role USING (true) WITH CHECK (true);


--
-- Name: cron_job_controls service_role_all_cron_job_controls; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_cron_job_controls ON public.cron_job_controls TO service_role USING (true) WITH CHECK (true);


--
-- Name: cron_run_log service_role_all_cron_run_log; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_cron_run_log ON public.cron_run_log TO service_role USING (true) WITH CHECK (true);


--
-- Name: experiences service_role_all_experiences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_experiences ON public.experiences TO service_role USING (true) WITH CHECK (true);


--
-- Name: order_events service_role_all_order_events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_order_events ON public.order_events TO service_role USING (true) WITH CHECK (true);


--
-- Name: order_messages service_role_all_order_messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_order_messages ON public.order_messages TO service_role USING (true) WITH CHECK (true);


--
-- Name: payment_booking_mismatch_governance service_role_all_payment_booking_mismatch_governance; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_payment_booking_mismatch_governance ON public.payment_booking_mismatch_governance TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_qa service_role_all_qa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_qa ON public.activity_qa TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_reviews service_role_all_reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY service_role_all_reviews ON public.activity_reviews TO service_role USING (true) WITH CHECK (true);


--
-- Name: settlement_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.settlement_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: soft_launch_control_audit; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.soft_launch_control_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: soft_launch_control_audit soft_launch_control_audit: authenticated read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "soft_launch_control_audit: authenticated read" ON public.soft_launch_control_audit FOR SELECT TO authenticated USING (true);


--
-- Name: soft_launch_control_audit soft_launch_control_audit: service_role full; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "soft_launch_control_audit: service_role full" ON public.soft_launch_control_audit TO service_role USING (true) WITH CHECK (true);


--
-- Name: soft_launch_controls; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.soft_launch_controls ENABLE ROW LEVEL SECURITY;

--
-- Name: soft_launch_controls soft_launch_controls: anon read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "soft_launch_controls: anon read" ON public.soft_launch_controls FOR SELECT TO anon USING (true);


--
-- Name: soft_launch_controls soft_launch_controls: authenticated read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "soft_launch_controls: authenticated read" ON public.soft_launch_controls FOR SELECT TO authenticated USING (true);


--
-- Name: soft_launch_controls soft_launch_controls: service_role full; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "soft_launch_controls: service_role full" ON public.soft_launch_controls TO service_role USING (true) WITH CHECK (true);


--
-- Name: soft_launch_whitelist; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.soft_launch_whitelist ENABLE ROW LEVEL SECURITY;

--
-- Name: soft_launch_whitelist soft_launch_whitelist: authenticated read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "soft_launch_whitelist: authenticated read" ON public.soft_launch_whitelist FOR SELECT TO authenticated USING (true);


--
-- Name: soft_launch_whitelist soft_launch_whitelist: service_role full; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "soft_launch_whitelist: service_role full" ON public.soft_launch_whitelist TO service_role USING (true) WITH CHECK (true);


--
-- Name: telegram_bind_code; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.telegram_bind_code ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_bind_code telegram_bind_code: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "telegram_bind_code: service role full access" ON public.telegram_bind_code USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: telegram_chat_mapping; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.telegram_chat_mapping ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_chat_mapping telegram_chat_mapping: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "telegram_chat_mapping: service role full access" ON public.telegram_chat_mapping USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: telegram_webhook_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.telegram_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_webhook_events telegram_webhook_events: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "telegram_webhook_events: service role full access" ON public.telegram_webhook_events USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: tour_reminder_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tour_reminder_log ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_reminder_log tour_reminder_log: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tour_reminder_log: service role full access" ON public.tour_reminder_log USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: traveler_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.traveler_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: traveler_profiles traveler_profiles_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY traveler_profiles_select_own ON public.traveler_profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: traveler_profiles traveler_profiles_service_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY traveler_profiles_service_all ON public.traveler_profiles USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: traveler_profiles traveler_profiles_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY traveler_profiles_update_own ON public.traveler_profiles FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: traveler_profiles traveler_profiles_upsert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY traveler_profiles_upsert_own ON public.traveler_profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: order_messages traveler_read_own_order_messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY traveler_read_own_order_messages ON public.order_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_messages.order_id) AND (o.user_id = auth.uid())))));


--
-- Name: user_notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: user_notifications user_notifications_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY user_notifications_select_own ON public.user_notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_notifications user_notifications_service_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY user_notifications_service_all ON public.user_notifications TO service_role USING (true) WITH CHECK (true);


--
-- Name: user_notifications user_notifications_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY user_notifications_update_own ON public.user_notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_points_ledger; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_points_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users: service role full access" ON public.users TO service_role USING (true) WITH CHECK (true);


--
-- Name: users users:servicerolefullaccess; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users:servicerolefullaccess" ON public.users TO service_role USING (true) WITH CHECK (true);


--
-- Name: wishlists; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

--
-- Name: wishlists wishlists: service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "wishlists: service role full access" ON public.wishlists TO service_role USING (true) WITH CHECK (true);


--
-- Name: wishlists wishlists: user delete own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "wishlists: user delete own" ON public.wishlists FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: wishlists wishlists: user insert own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "wishlists: user insert own" ON public.wishlists FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: wishlists wishlists: user select own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "wishlists: user select own" ON public.wishlists FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION fn_auto_full_status(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_auto_full_status() TO anon;
GRANT ALL ON FUNCTION public.fn_auto_full_status() TO authenticated;
GRANT ALL ON FUNCTION public.fn_auto_full_status() TO service_role;


--
-- Name: FUNCTION fn_book_schedule(p_schedule_id uuid, p_count integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_book_schedule(p_schedule_id uuid, p_count integer) TO anon;
GRANT ALL ON FUNCTION public.fn_book_schedule(p_schedule_id uuid, p_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.fn_book_schedule(p_schedule_id uuid, p_count integer) TO service_role;


--
-- Name: FUNCTION fn_cancel_booking(p_schedule_id uuid, p_count integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_cancel_booking(p_schedule_id uuid, p_count integer) TO anon;
GRANT ALL ON FUNCTION public.fn_cancel_booking(p_schedule_id uuid, p_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.fn_cancel_booking(p_schedule_id uuid, p_count integer) TO service_role;


--
-- Name: FUNCTION fn_create_external_hold(p_schedule_id uuid, p_count integer, p_guide_id uuid, p_activity_plan_id uuid, p_note text, p_actor_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_create_external_hold(p_schedule_id uuid, p_count integer, p_guide_id uuid, p_activity_plan_id uuid, p_note text, p_actor_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_create_external_hold(p_schedule_id uuid, p_count integer, p_guide_id uuid, p_activity_plan_id uuid, p_note text, p_actor_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_create_external_hold(p_schedule_id uuid, p_count integer, p_guide_id uuid, p_activity_plan_id uuid, p_note text, p_actor_user_id uuid) TO service_role;


--
-- Name: FUNCTION fn_expire_unpaid_order_atomic(p_order_id uuid, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_expire_unpaid_order_atomic(p_order_id uuid, p_now timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.fn_expire_unpaid_order_atomic(p_order_id uuid, p_now timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.fn_expire_unpaid_order_atomic(p_order_id uuid, p_now timestamp with time zone) TO service_role;


--
-- Name: FUNCTION fn_process_payment_callback_atomic(p_order_id uuid, p_trade_no text, p_owner_email text, p_raw_payload jsonb, p_merchant_trade_no text, p_provider text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_process_payment_callback_atomic(p_order_id uuid, p_trade_no text, p_owner_email text, p_raw_payload jsonb, p_merchant_trade_no text, p_provider text) TO anon;
GRANT ALL ON FUNCTION public.fn_process_payment_callback_atomic(p_order_id uuid, p_trade_no text, p_owner_email text, p_raw_payload jsonb, p_merchant_trade_no text, p_provider text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_process_payment_callback_atomic(p_order_id uuid, p_trade_no text, p_owner_email text, p_raw_payload jsonb, p_merchant_trade_no text, p_provider text) TO service_role;


--
-- Name: FUNCTION fn_redeem_promo_code(p_code text, p_user_id uuid, p_order_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_redeem_promo_code(p_code text, p_user_id uuid, p_order_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_redeem_promo_code(p_code text, p_user_id uuid, p_order_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_redeem_promo_code(p_code text, p_user_id uuid, p_order_id uuid) TO service_role;


--
-- Name: FUNCTION fn_refresh_activity_availability_daily(p_activity_id uuid, p_date_from date, p_date_to date); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_refresh_activity_availability_daily(p_activity_id uuid, p_date_from date, p_date_to date) TO anon;
GRANT ALL ON FUNCTION public.fn_refresh_activity_availability_daily(p_activity_id uuid, p_date_from date, p_date_to date) TO authenticated;
GRANT ALL ON FUNCTION public.fn_refresh_activity_availability_daily(p_activity_id uuid, p_date_from date, p_date_to date) TO service_role;


--
-- Name: FUNCTION fn_refresh_activity_availability_daily_by_schedule_change(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_refresh_activity_availability_daily_by_schedule_change() TO anon;
GRANT ALL ON FUNCTION public.fn_refresh_activity_availability_daily_by_schedule_change() TO authenticated;
GRANT ALL ON FUNCTION public.fn_refresh_activity_availability_daily_by_schedule_change() TO service_role;


--
-- Name: FUNCTION fn_release_external_hold(p_booking_id uuid, p_guide_id uuid, p_actor_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_release_external_hold(p_booking_id uuid, p_guide_id uuid, p_actor_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_release_external_hold(p_booking_id uuid, p_guide_id uuid, p_actor_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_release_external_hold(p_booking_id uuid, p_guide_id uuid, p_actor_user_id uuid) TO service_role;


--
-- Name: FUNCTION fn_reschedule_booking_atomic(p_request_id uuid, p_resolver text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.fn_reschedule_booking_atomic(p_request_id uuid, p_resolver text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_reschedule_booking_atomic(p_request_id uuid, p_resolver text) TO service_role;


--
-- Name: FUNCTION fn_schedule_date(ts timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_schedule_date(ts timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.fn_schedule_date(ts timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.fn_schedule_date(ts timestamp with time zone) TO service_role;


--
-- Name: FUNCTION generate_booking_no(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.generate_booking_no() TO anon;
GRANT ALL ON FUNCTION public.generate_booking_no() TO authenticated;
GRANT ALL ON FUNCTION public.generate_booking_no() TO service_role;


--
-- Name: FUNCTION handle_auth_user_sync(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.handle_auth_user_sync() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_auth_user_sync() TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION rls_grants_preflight_check_grants(p_table text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rls_grants_preflight_check_grants(p_table text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_grants_preflight_check_grants(p_table text) TO service_role;


--
-- Name: FUNCTION rls_grants_preflight_check_policies(p_table text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rls_grants_preflight_check_policies(p_table text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_grants_preflight_check_policies(p_table text) TO service_role;


--
-- Name: FUNCTION rls_preflight_scan(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rls_preflight_scan() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_preflight_scan() TO service_role;


--
-- Name: FUNCTION set_activity_qa_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_activity_qa_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_activity_qa_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_activity_qa_updated_at() TO service_role;


--
-- Name: FUNCTION set_admin_security_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_admin_security_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_admin_security_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_admin_security_updated_at() TO service_role;


--
-- Name: FUNCTION set_order_booking_no(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_order_booking_no() TO anon;
GRANT ALL ON FUNCTION public.set_order_booking_no() TO authenticated;
GRANT ALL ON FUNCTION public.set_order_booking_no() TO service_role;


--
-- Name: FUNCTION set_payment_booking_mismatch_governance_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_payment_booking_mismatch_governance_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_payment_booking_mismatch_governance_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_payment_booking_mismatch_governance_updated_at() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: TABLE activities; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.activities TO anon;
GRANT ALL ON TABLE public.activities TO authenticated;
GRANT ALL ON TABLE public.activities TO service_role;


--
-- Name: TABLE activity_addons; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.activity_addons TO anon;
GRANT ALL ON TABLE public.activity_addons TO authenticated;
GRANT ALL ON TABLE public.activity_addons TO service_role;


--
-- Name: TABLE activity_availability_daily; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.activity_availability_daily TO anon;
GRANT ALL ON TABLE public.activity_availability_daily TO authenticated;
GRANT ALL ON TABLE public.activity_availability_daily TO service_role;


--
-- Name: TABLE activity_images; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.activity_images TO anon;
GRANT ALL ON TABLE public.activity_images TO authenticated;
GRANT ALL ON TABLE public.activity_images TO service_role;


--
-- Name: TABLE activity_packages; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.activity_packages TO anon;
GRANT ALL ON TABLE public.activity_packages TO authenticated;
GRANT ALL ON TABLE public.activity_packages TO service_role;


--
-- Name: TABLE activity_plan_seasons; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.activity_plan_seasons TO anon;
GRANT ALL ON TABLE public.activity_plan_seasons TO authenticated;
GRANT ALL ON TABLE public.activity_plan_seasons TO service_role;


--
-- Name: TABLE activity_plan_tiers; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.activity_plan_tiers TO anon;
GRANT ALL ON TABLE public.activity_plan_tiers TO authenticated;
GRANT ALL ON TABLE public.activity_plan_tiers TO service_role;


--
-- Name: TABLE activity_plans; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.activity_plans TO anon;
GRANT ALL ON TABLE public.activity_plans TO authenticated;
GRANT ALL ON TABLE public.activity_plans TO service_role;


--
-- Name: TABLE activity_qa; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.activity_qa TO anon;
GRANT ALL ON TABLE public.activity_qa TO authenticated;
GRANT ALL ON TABLE public.activity_qa TO service_role;


--
-- Name: TABLE activity_reviews; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.activity_reviews TO anon;
GRANT ALL ON TABLE public.activity_reviews TO authenticated;
GRANT ALL ON TABLE public.activity_reviews TO service_role;


--
-- Name: TABLE activity_schedules; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.activity_schedules TO anon;
GRANT ALL ON TABLE public.activity_schedules TO authenticated;
GRANT ALL ON TABLE public.activity_schedules TO service_role;


--
-- Name: TABLE admin_security; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.admin_security TO anon;
GRANT ALL ON TABLE public.admin_security TO authenticated;
GRANT ALL ON TABLE public.admin_security TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: SEQUENCE audit_logs_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.audit_logs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.audit_logs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.audit_logs_id_seq TO service_role;


--
-- Name: TABLE booking_status_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.booking_status_history TO anon;
GRANT ALL ON TABLE public.booking_status_history TO authenticated;
GRANT ALL ON TABLE public.booking_status_history TO service_role;


--
-- Name: TABLE booking_status_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.booking_status_logs TO anon;
GRANT ALL ON TABLE public.booking_status_logs TO authenticated;
GRANT ALL ON TABLE public.booking_status_logs TO service_role;


--
-- Name: TABLE bookings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.bookings TO service_role;


--
-- Name: TABLE cron_job_controls; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.cron_job_controls TO anon;
GRANT ALL ON TABLE public.cron_job_controls TO authenticated;
GRANT ALL ON TABLE public.cron_job_controls TO service_role;


--
-- Name: TABLE cron_run_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.cron_run_log TO anon;
GRANT ALL ON TABLE public.cron_run_log TO authenticated;
GRANT ALL ON TABLE public.cron_run_log TO service_role;


--
-- Name: SEQUENCE cron_run_log_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.cron_run_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.cron_run_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cron_run_log_id_seq TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: SEQUENCE events_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.events_id_seq TO service_role;


--
-- Name: TABLE experiences; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.experiences TO anon;
GRANT ALL ON TABLE public.experiences TO authenticated;
GRANT ALL ON TABLE public.experiences TO service_role;


--
-- Name: TABLE guide_applications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.guide_applications TO service_role;


--
-- Name: TABLE guide_availability_rules; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.guide_availability_rules TO anon;
GRANT ALL ON TABLE public.guide_availability_rules TO authenticated;
GRANT ALL ON TABLE public.guide_availability_rules TO service_role;


--
-- Name: TABLE guide_balances; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.guide_balances TO service_role;


--
-- Name: TABLE guide_blackout_dates; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.guide_blackout_dates TO anon;
GRANT ALL ON TABLE public.guide_blackout_dates TO authenticated;
GRANT ALL ON TABLE public.guide_blackout_dates TO service_role;


--
-- Name: TABLE guide_line_bind_code; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.guide_line_bind_code TO anon;
GRANT ALL ON TABLE public.guide_line_bind_code TO authenticated;
GRANT ALL ON TABLE public.guide_line_bind_code TO service_role;


--
-- Name: TABLE guide_line_mapping; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.guide_line_mapping TO anon;
GRANT ALL ON TABLE public.guide_line_mapping TO authenticated;
GRANT ALL ON TABLE public.guide_line_mapping TO service_role;


--
-- Name: TABLE guide_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.guide_profiles TO anon;
GRANT ALL ON TABLE public.guide_profiles TO authenticated;
GRANT ALL ON TABLE public.guide_profiles TO service_role;


--
-- Name: TABLE guide_slot_conflict_overrides; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.guide_slot_conflict_overrides TO anon;
GRANT ALL ON TABLE public.guide_slot_conflict_overrides TO authenticated;
GRANT ALL ON TABLE public.guide_slot_conflict_overrides TO service_role;


--
-- Name: TABLE guide_trip_reports; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.guide_trip_reports TO service_role;


--
-- Name: TABLE homepage_featured_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.homepage_featured_settings TO anon;
GRANT ALL ON TABLE public.homepage_featured_settings TO authenticated;
GRANT ALL ON TABLE public.homepage_featured_settings TO service_role;


--
-- Name: TABLE incidents; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.incidents TO anon;
GRANT ALL ON TABLE public.incidents TO authenticated;
GRANT ALL ON TABLE public.incidents TO service_role;


--
-- Name: TABLE kpi_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.kpi_settings TO anon;
GRANT ALL ON TABLE public.kpi_settings TO authenticated;
GRANT ALL ON TABLE public.kpi_settings TO service_role;


--
-- Name: TABLE kpi_settings_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.kpi_settings_history TO anon;
GRANT ALL ON TABLE public.kpi_settings_history TO authenticated;
GRANT ALL ON TABLE public.kpi_settings_history TO service_role;


--
-- Name: TABLE line_bind_code; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.line_bind_code TO anon;
GRANT ALL ON TABLE public.line_bind_code TO authenticated;
GRANT ALL ON TABLE public.line_bind_code TO service_role;


--
-- Name: TABLE line_user_mapping; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.line_user_mapping TO anon;
GRANT ALL ON TABLE public.line_user_mapping TO authenticated;
GRANT ALL ON TABLE public.line_user_mapping TO service_role;


--
-- Name: TABLE line_webhook_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.line_webhook_events TO anon;
GRANT ALL ON TABLE public.line_webhook_events TO authenticated;
GRANT ALL ON TABLE public.line_webhook_events TO service_role;


--
-- Name: TABLE midao_availability_defaults; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.midao_availability_defaults TO anon;
GRANT ALL ON TABLE public.midao_availability_defaults TO authenticated;
GRANT ALL ON TABLE public.midao_availability_defaults TO service_role;


--
-- Name: TABLE midao_day_overrides; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.midao_day_overrides TO anon;
GRANT ALL ON TABLE public.midao_day_overrides TO authenticated;
GRANT ALL ON TABLE public.midao_day_overrides TO service_role;


--
-- Name: TABLE midao_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.midao_requests TO anon;
GRANT ALL ON TABLE public.midao_requests TO authenticated;
GRANT ALL ON TABLE public.midao_requests TO service_role;


--
-- Name: TABLE notification_event_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.notification_event_settings TO anon;
GRANT ALL ON TABLE public.notification_event_settings TO authenticated;
GRANT ALL ON TABLE public.notification_event_settings TO service_role;


--
-- Name: TABLE notification_event_settings_audit; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.notification_event_settings_audit TO anon;
GRANT ALL ON TABLE public.notification_event_settings_audit TO authenticated;
GRANT ALL ON TABLE public.notification_event_settings_audit TO service_role;


--
-- Name: TABLE operations_tracking; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.operations_tracking TO anon;
GRANT ALL ON TABLE public.operations_tracking TO authenticated;
GRANT ALL ON TABLE public.operations_tracking TO service_role;


--
-- Name: TABLE order_addons; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.order_addons TO anon;
GRANT ALL ON TABLE public.order_addons TO authenticated;
GRANT ALL ON TABLE public.order_addons TO service_role;


--
-- Name: TABLE order_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.order_events TO anon;
GRANT ALL ON TABLE public.order_events TO authenticated;
GRANT ALL ON TABLE public.order_events TO service_role;


--
-- Name: SEQUENCE order_events_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.order_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.order_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.order_events_id_seq TO service_role;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.order_items TO anon;
GRANT ALL ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;


--
-- Name: TABLE order_messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.order_messages TO anon;
GRANT ALL ON TABLE public.order_messages TO authenticated;
GRANT ALL ON TABLE public.order_messages TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: SEQUENCE orders_booking_no_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.orders_booking_no_seq TO anon;
GRANT ALL ON SEQUENCE public.orders_booking_no_seq TO authenticated;
GRANT ALL ON SEQUENCE public.orders_booking_no_seq TO service_role;


--
-- Name: TABLE package_activities; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.package_activities TO anon;
GRANT ALL ON TABLE public.package_activities TO authenticated;
GRANT ALL ON TABLE public.package_activities TO service_role;


--
-- Name: TABLE payment_booking_mismatch_governance; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.payment_booking_mismatch_governance TO anon;
GRANT ALL ON TABLE public.payment_booking_mismatch_governance TO authenticated;
GRANT ALL ON TABLE public.payment_booking_mismatch_governance TO service_role;


--
-- Name: SEQUENCE payment_booking_mismatch_governance_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.payment_booking_mismatch_governance_id_seq TO anon;
GRANT ALL ON SEQUENCE public.payment_booking_mismatch_governance_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.payment_booking_mismatch_governance_id_seq TO service_role;


--
-- Name: TABLE payment_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_events TO service_role;


--
-- Name: TABLE payment_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.payment_logs TO anon;
GRANT ALL ON TABLE public.payment_logs TO authenticated;
GRANT ALL ON TABLE public.payment_logs TO service_role;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payments TO service_role;


--
-- Name: TABLE payout_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.payout_items TO anon;
GRANT ALL ON TABLE public.payout_items TO authenticated;
GRANT ALL ON TABLE public.payout_items TO service_role;


--
-- Name: TABLE payouts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payouts TO service_role;


--
-- Name: TABLE promo_codes; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.promo_codes TO anon;
GRANT ALL ON TABLE public.promo_codes TO authenticated;
GRANT ALL ON TABLE public.promo_codes TO service_role;


--
-- Name: TABLE promo_redemptions; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.promo_redemptions TO anon;
GRANT ALL ON TABLE public.promo_redemptions TO authenticated;
GRANT ALL ON TABLE public.promo_redemptions TO service_role;


--
-- Name: TABLE refund_policies; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.refund_policies TO anon;
GRANT ALL ON TABLE public.refund_policies TO authenticated;
GRANT ALL ON TABLE public.refund_policies TO service_role;


--
-- Name: TABLE refund_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.refund_requests TO service_role;


--
-- Name: TABLE reschedule_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.reschedule_requests TO anon;
GRANT ALL ON TABLE public.reschedule_requests TO authenticated;
GRANT ALL ON TABLE public.reschedule_requests TO service_role;


--
-- Name: TABLE review_invitations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.review_invitations TO service_role;


--
-- Name: TABLE settlement_rules; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.settlement_rules TO service_role;


--
-- Name: TABLE soft_launch_control_audit; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.soft_launch_control_audit TO anon;
GRANT ALL ON TABLE public.soft_launch_control_audit TO authenticated;
GRANT ALL ON TABLE public.soft_launch_control_audit TO service_role;


--
-- Name: TABLE soft_launch_controls; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.soft_launch_controls TO service_role;
GRANT SELECT ON TABLE public.soft_launch_controls TO anon;
GRANT SELECT ON TABLE public.soft_launch_controls TO authenticated;


--
-- Name: TABLE soft_launch_whitelist; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.soft_launch_whitelist TO anon;
GRANT ALL ON TABLE public.soft_launch_whitelist TO authenticated;
GRANT ALL ON TABLE public.soft_launch_whitelist TO service_role;


--
-- Name: TABLE telegram_bind_code; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.telegram_bind_code TO anon;
GRANT ALL ON TABLE public.telegram_bind_code TO authenticated;
GRANT ALL ON TABLE public.telegram_bind_code TO service_role;


--
-- Name: TABLE telegram_chat_mapping; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.telegram_chat_mapping TO anon;
GRANT ALL ON TABLE public.telegram_chat_mapping TO authenticated;
GRANT ALL ON TABLE public.telegram_chat_mapping TO service_role;


--
-- Name: TABLE telegram_webhook_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.telegram_webhook_events TO anon;
GRANT ALL ON TABLE public.telegram_webhook_events TO authenticated;
GRANT ALL ON TABLE public.telegram_webhook_events TO service_role;


--
-- Name: TABLE tour_reminder_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.tour_reminder_log TO anon;
GRANT ALL ON TABLE public.tour_reminder_log TO authenticated;
GRANT ALL ON TABLE public.tour_reminder_log TO service_role;


--
-- Name: TABLE traveler_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.traveler_profiles TO service_role;


--
-- Name: TABLE user_notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.user_notifications TO anon;
GRANT ALL ON TABLE public.user_notifications TO authenticated;
GRANT ALL ON TABLE public.user_notifications TO service_role;


--
-- Name: TABLE user_points_ledger; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.user_points_ledger TO anon;
GRANT ALL ON TABLE public.user_points_ledger TO authenticated;
GRANT ALL ON TABLE public.user_points_ledger TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: TABLE wishlists; Type: ACL; Schema: public; Owner: postgres
--

GRANT MAINTAIN ON TABLE public.wishlists TO anon;
GRANT ALL ON TABLE public.wishlists TO authenticated;
GRANT ALL ON TABLE public.wishlists TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

