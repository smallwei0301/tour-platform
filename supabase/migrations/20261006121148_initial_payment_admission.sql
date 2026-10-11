-- 初次付款 admission kernel；所有 writer 接線後才具有 order-wide authority。
-- 不改 #59／captured baseline，不加 fixture unique index，不釋放未核 provider terminal。
-- Manual paid/event/booking/order 仍須整筆 transaction 合流，本 kernel 對 manual fail closed。
BEGIN;

CREATE FUNCTION public.fn_admit_initial_payment_attempt(
  p_order_id uuid, p_provider text, p_merchant_trade_no text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_count integer := 0;
  v_base_count integer;
  v_invalid_count integer;
  v_item_total bigint;
  v_now timestamptz;
  v_trade text;
BEGIN
  IF p_order_id IS NULL OR p_provider IS NULL OR p_provider NOT IN ('ecpay', 'transfer', 'manual')
    OR p_merchant_trade_no IS NULL OR p_merchant_trade_no !~ '^[A-Za-z0-9]{1,20}$' THEN
    RAISE EXCEPTION 'invalid initial payment admission request' USING ERRCODE = '22023';
  END IF;

  -- Sole cross-process serialization authority. Re-read eligibility after waiting.
  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  v_now := clock_timestamp();
  IF NOT FOUND OR v_order.status IS DISTINCT FROM 'pending_payment'
    OR v_order.payment_status IS DISTINCT FROM 'pending' OR v_order.total_twd IS NULL OR v_order.total_twd < 0 THEN
    RETURN jsonb_build_object('outcome', 'hold', 'code', 'ORDER_NOT_MATERIALIZED');
  END IF;
  IF v_order.payment_deadline_at IS NOT NULL AND v_order.payment_deadline_at <= v_now THEN
    RETURN jsonb_build_object('outcome', 'hold', 'code', 'ORDER_PAYMENT_EXPIRED');
  END IF;

  SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = v_order.booking_id FOR UPDATE;
  IF NOT FOUND OR v_booking.order_id IS DISTINCT FROM v_order.id OR v_booking.status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('outcome', 'hold', 'code', 'ORDER_NOT_MATERIALIZED');
  END IF;
  IF v_booking.traveler_confirmation_status IS DISTINCT FROM 'confirmed'
    AND (v_booking.source_inquiry_id IS NOT NULL OR v_booking.traveler_confirmation_status IN ('pending', 'expired')) THEN
    RETURN jsonb_build_object('outcome', 'hold', 'code', 'TRAVELER_CONFIRMATION_REQUIRED');
  END IF;

  SELECT count(*) FILTER (WHERE i.item_type = 'activity_booking'), sum(i.subtotal_amount),
    count(*) FILTER (WHERE i.subtotal_amount IS NULL OR (
      (i.item_type = 'activity_booking' AND i.booking_id = v_order.booking_id)
      OR (i.item_type = 'fee' AND i.metadata->>'kind' = 'addon')
      OR (i.item_type = 'discount' AND i.metadata->>'kind' = 'points_redemption')
    ) IS NOT TRUE)
    INTO v_base_count, v_item_total, v_invalid_count
    FROM public.order_items i WHERE i.order_id = v_order.id;
  IF v_base_count <> 1 OR v_invalid_count <> 0 OR v_item_total IS DISTINCT FROM v_order.total_twd::bigint THEN
    RETURN jsonb_build_object('outcome', 'hold', 'code', 'ORDER_NOT_MATERIALIZED');
  END IF;

  -- Inspect every row, including unknown and terminal local statuses. A local
  -- failed/cancelled string does not establish provider-confirmed retry evidence.
  FOR v_payment IN SELECT pay.* FROM public.payments pay WHERE pay.order_id = v_order.id FOR UPDATE LOOP
    v_count := v_count + 1;
    v_existing := v_payment;
  END LOOP;
  IF v_count > 1 THEN
    RETURN jsonb_build_object('outcome', 'hold', 'code', 'PAYMENT_RECONCILIATION_REQUIRED');
  END IF;
  IF v_count = 1 THEN
    v_trade := CASE WHEN v_existing.provider = 'ecpay' THEN nullif(v_existing.merchant_trade_no, '')
      ELSE coalesce(nullif(v_existing.merchant_trade_no, ''), nullif(v_existing.trade_no, '')) END;
    IF v_existing.status IS DISTINCT FROM 'pending' OR v_trade IS NULL OR v_trade !~ '^[A-Za-z0-9]{1,20}$'
      OR v_existing.amount_twd IS DISTINCT FROM v_order.total_twd OR v_existing.paid_at IS NOT NULL
      OR v_existing.captured_amount_twd IS DISTINCT FROM 0
      OR (v_existing.provider_status IS NOT NULL AND v_existing.provider_status <> 'pending')
      OR v_existing.last_provider_query_payload IS NOT NULL THEN
      RETURN jsonb_build_object('outcome', 'hold', 'code', 'PAYMENT_RECONCILIATION_REQUIRED', 'id', v_existing.id, 'provider', v_existing.provider);
    END IF;
    IF p_provider = 'manual' AND v_existing.provider = 'transfer' THEN
      RETURN jsonb_build_object('outcome', 'hold', 'code', 'TRANSFER_RECONCILIATION_REQUIRED', 'id', v_existing.id, 'provider', v_existing.provider);
    END IF;
    IF v_existing.provider IS DISTINCT FROM p_provider THEN
      RETURN jsonb_build_object('outcome', 'hold', 'code', 'PAYMENT_PROVIDER_CONFLICT', 'id', v_existing.id, 'provider', v_existing.provider);
    END IF;
    IF p_provider = 'manual' THEN
      RETURN jsonb_build_object('outcome', 'hold', 'code', 'MANUAL_SETTLEMENT_REQUIRED', 'id', v_existing.id, 'provider', v_existing.provider);
    END IF;
    RETURN jsonb_build_object('outcome', 'reuse', 'id', v_existing.id, 'orderId', v_order.id,
      'provider', p_provider, 'merchantTradeNo', v_trade, 'status', v_existing.status,
      'amountTwd', v_existing.amount_twd, 'reused', true);
  END IF;
  IF p_provider = 'manual' THEN
    RETURN jsonb_build_object('outcome', 'hold', 'code', 'MANUAL_SETTLEMENT_REQUIRED');
  END IF;

  -- Persisted order total, payment and required event share this transaction.
  INSERT INTO public.payments(order_id, booking_id, provider, merchant_trade_no, trade_no,
    amount_twd, currency, status, provider_status, updated_at)
  VALUES (v_order.id, v_booking.id, p_provider, p_merchant_trade_no,
    CASE WHEN p_provider = 'transfer' THEN p_merchant_trade_no ELSE NULL END,
    v_order.total_twd, 'TWD', 'pending', 'pending', v_now)
  RETURNING * INTO v_payment;
  INSERT INTO public.payment_events(payment_id, order_id, provider, event_type, merchant_trade_no, trade_no, payload)
  VALUES (v_payment.id, v_order.id, p_provider, 'initiated', v_payment.merchant_trade_no, v_payment.trade_no,
    jsonb_build_object('bookingId', v_booking.id, 'orderId', v_order.id, 'paymentId', v_payment.id,
      'amount', v_order.total_twd, 'provider', p_provider));
  RETURN jsonb_build_object('outcome', 'create', 'id', v_payment.id, 'orderId', v_order.id,
    'provider', p_provider, 'merchantTradeNo', p_merchant_trade_no, 'status', 'pending',
    'amountTwd', v_order.total_twd, 'reused', false);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_admit_initial_payment_attempt(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admit_initial_payment_attempt(uuid, text, text) TO service_role;
COMMIT;
