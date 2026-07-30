CREATE OR REPLACE FUNCTION public.midao_decide_booking_request(
  p_booking_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $midao$
DECLARE
  v_action text;
  v_note text;
  v_decided_at timestamptz;
  v_payment_deadline_at timestamptz;
  v_booking_status text;
  v_approval_status text;
  v_order_status text;
  v_schedule_id uuid;
  v_order_count integer := 0;
  v_order public.orders%ROWTYPE;
  v_order_candidate public.orders%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BOOKING_ID';
  END IF;

  v_action := pg_catalog.lower(pg_catalog.btrim(p_action));
  IF v_action IS NULL OR v_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTION';
  END IF;

  v_note := NULLIF(pg_catalog.btrim(p_note), '');
  IF p_note IS NOT NULL AND pg_catalog.octet_length(p_note) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_NOTE';
  END IF;

  FOR v_order_candidate IN
    SELECT o.*
    FROM public.orders AS o
    WHERE o.booking_id = p_booking_id
    FOR UPDATE
  LOOP
    v_order_count := v_order_count + 1;
    IF v_order_count = 1 THEN
      v_order := v_order_candidate;
    END IF;
  END LOOP;

  IF v_order_count <> 1 THEN
    IF v_order_count = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'BOOKING_NOT_FOUND';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_BOOKING_RELATION_INVALID';
  END IF;

  SELECT b.*
  INTO v_booking
  FROM public.bookings AS b
  WHERE b.id = p_booking_id
    AND b.order_id = v_order.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_BOOKING_RELATION_INVALID';
  END IF;

  IF v_order.schedule_id IS NOT NULL THEN
    SELECT s.id
    INTO v_schedule_id
    FROM public.activity_schedules AS s
    WHERE s.id = v_order.schedule_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_SCHEDULE_RELATION_INVALID';
    END IF;
  END IF;

  IF NOT (
    v_booking.guide_approval_status IS NOT DISTINCT FROM 'pending'
    AND v_booking.status IS NOT DISTINCT FROM 'draft'
    AND v_order.status IS NOT DISTINCT FROM 'pending_payment'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_PENDING_APPROVAL';
  END IF;

  v_decided_at := pg_catalog.now();
  v_payment_deadline_at := NULL;

  IF v_action = 'approve' THEN
    v_payment_deadline_at := v_decided_at + INTERVAL '24 hours';

    UPDATE public.bookings
    SET guide_approval_status = 'approved',
        guide_approval_decided_at = v_decided_at,
        guide_approval_note = v_note,
        status = 'draft',
        updated_at = v_decided_at
    WHERE id = v_booking.id
      AND order_id = v_order.id
      AND guide_approval_status = 'pending'
      AND status = 'draft';

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_PENDING_APPROVAL';
    END IF;

    UPDATE public.orders
    SET status = 'pending_payment',
        payment_deadline_at = v_payment_deadline_at,
        updated_at = v_decided_at
    WHERE id = v_order.id
      AND booking_id = p_booking_id
      AND status = 'pending_payment';

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_PENDING_APPROVAL';
    END IF;

    v_booking_status := 'draft';
    v_approval_status := 'approved';
    v_order_status := 'pending_payment';
  ELSE
    UPDATE public.bookings
    SET guide_approval_status = 'rejected',
        guide_approval_decided_at = v_decided_at,
        guide_approval_note = v_note,
        status = 'cancelled',
        cancelled_at = v_decided_at,
        updated_at = v_decided_at
    WHERE id = v_booking.id
      AND order_id = v_order.id
      AND guide_approval_status = 'pending'
      AND status = 'draft';

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_PENDING_APPROVAL';
    END IF;

    UPDATE public.orders
    SET status = 'cancelled_by_guide',
        payment_deadline_at = NULL,
        updated_at = v_decided_at
    WHERE id = v_order.id
      AND booking_id = p_booking_id
      AND status = 'pending_payment';

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_PENDING_APPROVAL';
    END IF;

    v_booking_status := 'cancelled';
    v_approval_status := 'rejected';
    v_order_status := 'cancelled_by_guide';
  END IF;

  INSERT INTO public.booking_status_logs (
    booking_id,
    from_status,
    to_status,
    actor_user_id,
    actor_role,
    reason,
    metadata
  ) VALUES (
    v_booking.id,
    v_booking.status,
    v_booking_status,
    NULL::uuid,
    'guide',
    CASE WHEN v_action = 'approve' THEN 'guide_approved' ELSE 'guide_rejected' END,
    pg_catalog.jsonb_build_object('action', v_action)
  );

  INSERT INTO public.midao_notification_outbox (
    event_name,
    aggregate_type,
    aggregate_id,
    payload
  ) VALUES (
    CASE WHEN v_action = 'approve' THEN 'booking.request_approved' ELSE 'booking.request_rejected' END,
    'booking',
    p_booking_id::text,
    pg_catalog.jsonb_build_object(
      'bookingId', p_booking_id,
      'orderId', v_order.id,
      'action', v_action,
      'guideApprovalStatus', v_approval_status,
      'bookingStatus', v_booking_status,
      'orderStatus', v_order_status,
      'paymentDeadlineAt', v_payment_deadline_at
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'bookingId', p_booking_id,
    'bookingNo', v_booking.booking_no,
    'orderId', v_order.id,
    'status', v_booking_status,
    'guideApprovalStatus', v_approval_status,
    'paymentDeadlineAt', v_payment_deadline_at,
    'action', v_action
  );
END;
$midao$;

REVOKE ALL ON FUNCTION public.midao_decide_booking_request(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_decide_booking_request(uuid, text, text)
  TO service_role;
