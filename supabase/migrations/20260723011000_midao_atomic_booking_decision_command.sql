CREATE OR REPLACE FUNCTION public.midao_decide_booking_request(
  p_guide_id uuid,
  p_actor_type text,
  p_actor_id text,
  p_booking_id uuid,
  p_action text,
  p_note text,
  p_idempotency_key text,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $midao$
DECLARE
  v_actor_type text;
  v_actor_id text;
  v_action text;
  v_note text;
  v_idempotency_key text;
  v_request_hash text;
  v_idempotency_id uuid;
  v_idempotency_state text;
  v_stored_hash text;
  v_replay_body jsonb;
  v_claimed boolean := false;
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
  v_response_body jsonb;
BEGIN
  IF p_guide_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_GUIDE_ID';
  END IF;
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BOOKING_ID';
  END IF;

  v_actor_type := pg_catalog.lower(pg_catalog.btrim(p_actor_type));
  v_actor_id := pg_catalog.btrim(p_actor_id);
  IF v_actor_type IS NULL OR v_actor_type NOT IN ('guide', 'admin') OR v_actor_id IS NULL OR v_actor_id = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTOR';
  END IF;
  IF pg_catalog.octet_length(v_actor_id) > 128 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTOR';
  END IF;

  v_action := pg_catalog.lower(pg_catalog.btrim(p_action));
  IF v_action IS NULL OR v_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTION';
  END IF;

  v_note := NULLIF(pg_catalog.btrim(p_note), '');
  IF v_note IS NOT NULL AND pg_catalog.octet_length(v_note) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_NOTE';
  END IF;
  IF v_action = 'reject' AND v_note IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_NOTE';
  END IF;

  v_idempotency_key := NULLIF(pg_catalog.btrim(p_idempotency_key), '');
  IF v_idempotency_key IS NULL OR pg_catalog.octet_length(v_idempotency_key) > 128 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  v_request_hash := pg_catalog.lower(pg_catalog.btrim(p_request_hash));
  IF v_request_hash IS NULL OR v_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REQUEST_HASH';
  END IF;

  INSERT INTO public.midao_idempotency_records (
    actor_type,
    actor_id,
    command_name,
    scope_type,
    scope_id,
    idempotency_key,
    request_hash,
    state,
    expires_at
  ) VALUES (
    v_actor_type,
    v_actor_id,
    'decide_booking_request',
    'booking',
    p_booking_id,
    v_idempotency_key,
    v_request_hash,
    'processing',
    pg_catalog.now() + INTERVAL '1 day'
  )
  ON CONFLICT (scope_type, scope_id, command_name, idempotency_key) DO NOTHING
  RETURNING id INTO v_idempotency_id;
  v_claimed := FOUND;

  IF NOT v_claimed THEN
    SELECT id, state, request_hash, response_body
    INTO v_idempotency_id, v_idempotency_state, v_stored_hash, v_replay_body
    FROM public.midao_idempotency_records
    WHERE scope_type = 'booking'
      AND scope_id = p_booking_id
      AND command_name = 'decide_booking_request'
      AND idempotency_key = v_idempotency_key
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
    END IF;
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

  IF v_booking.guide_id IS DISTINCT FROM p_guide_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'BOOKING_NOT_FOUND';
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

  IF NOT v_claimed THEN
    IF v_stored_hash <> v_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_CONFLICT';
    END IF;
    IF v_idempotency_state = 'processing' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_IN_PROGRESS';
    END IF;
    IF v_idempotency_state <> 'completed' OR v_replay_body IS NULL OR v_replay_body = 'null'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
    END IF;
    RETURN v_replay_body;
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
    v_actor_type,
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

  v_response_body := pg_catalog.jsonb_build_object(
    'bookingId', p_booking_id,
    'bookingNo', v_booking.booking_no,
    'orderId', v_order.id,
    'status', v_booking_status,
    'guideApprovalStatus', v_approval_status,
    'paymentDeadlineAt', v_payment_deadline_at,
    'action', v_action
  );

  UPDATE public.midao_idempotency_records
  SET state = 'completed',
      response_status = 200,
      response_body = v_response_body,
      resource_type = 'booking',
      resource_id = p_booking_id::text,
      locked_at = v_decided_at,
      completed_at = v_decided_at
  WHERE id = v_idempotency_id
    AND state = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
  END IF;

  RETURN v_response_body;
END;
$midao$;

REVOKE ALL ON FUNCTION public.midao_decide_booking_request(uuid, text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_decide_booking_request(uuid, text, text, text, text, text, text, text)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.midao_decide_booking_request(uuid, text, text)
  FROM service_role;
