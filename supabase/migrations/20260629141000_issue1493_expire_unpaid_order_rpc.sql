-- #1493 — 逾時未付款訂單自動取消（原子）。
-- 鎖序維持 orders → bookings → activity_schedules（與 fn_process_payment_callback_atomic 一致），
-- 避免與「剛好付款成功」競態造成狀態不一致。冪等：只在 order 仍為 pending_payment 且
-- 已過 payment_deadline_at 時才動作；已付款／已取消／未到期 → noop。
--
-- Rollback: DROP FUNCTION IF EXISTS fn_expire_unpaid_order_atomic(uuid, timestamptz);

CREATE OR REPLACE FUNCTION fn_expire_unpaid_order_atomic(
  p_order_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  order_id uuid,
  expired boolean,
  order_status text,
  booking_id uuid,
  booking_status text,
  schedule_id uuid,
  schedule_released boolean
)
LANGUAGE plpgsql
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
