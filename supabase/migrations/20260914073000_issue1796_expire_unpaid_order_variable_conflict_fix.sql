-- #1796 — Fix the remaining PL/pgSQL output-column ambiguity in unpaid expiry.
--
-- The RETURNS TABLE field `booking_id` is a PL/pgSQL variable.  The prior
-- migration qualified the de-dup predicate, but PostgreSQL can still resolve
-- an unqualified SQL column reference in this function ambiguously.  Compile
-- this replacement with column precedence; all actual PL/pgSQL values remain
-- explicitly v_* or p_* identifiers.
--
-- Rollback: re-apply the preceding function definition.

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
#variable_conflict use_column
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

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_order_id, false, NULL::text, NULL::uuid, NULL::text, NULL::uuid, false;
    RETURN;
  END IF;

  IF v_order.status <> 'pending_payment'
     OR v_order.payment_deadline_at IS NULL
     OR v_order.payment_deadline_at > p_now THEN
    RETURN QUERY SELECT p_order_id, false, v_order.status, v_order.booking_id, NULL::text, NULL::uuid, false;
    RETURN;
  END IF;

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
          SELECT 1 FROM booking_status_logs AS booking_log
          WHERE booking_log.booking_id = v_booking.id
            AND booking_log.to_status = 'cancelled'
            AND booking_log.reason = 'payment_deadline_expired'
        );

        IF v_booking.schedule_id IS NOT NULL THEN
          v_book_result := fn_cancel_booking(v_booking.schedule_id, v_booking.participants);
          v_schedule_released := coalesce((v_book_result->>'ok')::boolean, false);
        END IF;
      ELSE
        v_booking_status := v_booking.status;
      END IF;
    END IF;
  END IF;

  UPDATE orders
    SET status = 'cancelled_unpaid', updated_at = p_now
    WHERE id = p_order_id;

  RETURN QUERY SELECT p_order_id, true, 'cancelled_unpaid'::text, v_booking_id, v_booking_status, v_schedule_id, v_schedule_released;
END;
$$;
