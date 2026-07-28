-- Issue #1757 Task 14: scalable Midao booking-request list projection.
-- Source only in this PR. Do not apply to production without the migration override workflow.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_order_messages_order_latest
  ON public.order_messages(order_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.midao_list_booking_requests(
  p_guide_id uuid,
  p_bucket text DEFAULT 'all',
  p_sort text DEFAULT 'priority',
  p_cursor_rank integer DEFAULT NULL,
  p_cursor_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  booking_id uuid,
  guide_id uuid,
  order_id uuid,
  booking_no text,
  booking_status text,
  guide_approval_status text,
  order_status text,
  bucket text,
  secondary_state text,
  needs_reply boolean,
  display_name text,
  email_masked text,
  activity_id uuid,
  activity_plan_id uuid,
  activity_title text,
  plan_name text,
  booking_type text,
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  party_size integer,
  total_twd integer,
  payment_deadline_at timestamptz,
  received_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  priority_rank integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF p_guide_id IS NULL THEN
    RAISE EXCEPTION 'MIDAO_REQUESTS_GUIDE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_bucket IS NULL OR p_bucket NOT IN ('all', 'new', 'needs_reply', 'replied', 'completed') THEN
    RAISE EXCEPTION 'MIDAO_REQUESTS_BUCKET_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_sort IS NULL OR p_sort NOT IN ('priority', 'updated_desc', 'service_asc') THEN
    RAISE EXCEPTION 'MIDAO_REQUESTS_SORT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 51 THEN
    RAISE EXCEPTION 'MIDAO_REQUESTS_LIMIT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF num_nonnulls(p_cursor_rank, p_cursor_at, p_cursor_id) NOT IN (0, 3) THEN
    RAISE EXCEPTION 'MIDAO_REQUESTS_CURSOR_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_cursor_rank IS NOT NULL AND (p_cursor_rank < 0 OR p_cursor_rank > 3) THEN
    RAISE EXCEPTION 'MIDAO_REQUESTS_CURSOR_INVALID' USING ERRCODE = '22023';
  END IF;

  -- A request row outside the closed lifecycle vocabulary is corruption, not an
  -- item to silently omit. This preflight deliberately shares the same owner and
  -- request-plan boundary as the projection below.
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.orders o
      ON o.booking_id = b.id
     AND o.id = b.order_id
    JOIN public.activity_plans ap
      ON ap.id = b.activity_plan_id
     AND ap.booking_type = 'request'
    WHERE b.guide_id = p_guide_id
      AND NOT (
        (b.guide_approval_status = 'rejected' AND b.status = 'cancelled' AND o.status = 'cancelled_by_guide')
        OR (b.guide_approval_status = 'approved' AND b.status = 'cancelled'
          AND o.status IN ('cancelled_unpaid', 'cancelled_by_user', 'cancelled_by_guide', 'refund_pending', 'refunded'))
        OR (b.guide_approval_status = 'approved' AND b.status = 'no_show'
          AND o.status IN ('paid', 'confirmed', 'completed'))
        OR (b.guide_approval_status = 'approved' AND (
          (b.status = 'confirmed' AND o.status IN ('paid', 'confirmed'))
          OR (b.status = 'completed' AND o.status = 'completed')
        ))
        OR (b.guide_approval_status = 'pending' AND b.status = 'draft' AND o.status = 'pending_payment')
        OR (b.guide_approval_status = 'approved' AND b.status = 'draft' AND o.status = 'pending_payment')
      )
  ) THEN
    RAISE EXCEPTION 'MIDAO_REQUESTS_STATE_INVALID' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH state_rows AS (
    SELECT
      b.id AS booking_id,
      b.guide_id,
      o.id AS order_id,
      b.booking_no,
      b.status AS booking_status,
      b.guide_approval_status,
      o.status AS order_status,
      CASE
        WHEN b.guide_approval_status = 'pending' THEN 'new'
        WHEN b.guide_approval_status = 'approved' AND b.status = 'draft'
          AND lm.sender_role = 'traveler' THEN 'needs_reply'
        WHEN b.guide_approval_status = 'approved' AND b.status = 'draft' THEN 'replied'
        ELSE 'completed'
      END AS bucket,
      CASE
        WHEN b.guide_approval_status = 'rejected' THEN 'rejected'
        WHEN b.guide_approval_status = 'pending' THEN 'pending_approval'
        WHEN b.guide_approval_status = 'approved' AND b.status = 'draft' THEN
          CASE WHEN lm.sender_role = 'traveler' THEN NULL ELSE 'awaiting_payment' END
        WHEN b.status = 'cancelled' AND o.status = 'cancelled_unpaid' THEN 'expired'
        WHEN b.status = 'cancelled' AND o.status IN ('cancelled_by_user', 'cancelled_by_guide') THEN 'cancelled'
        WHEN b.status = 'cancelled' AND o.status = 'refund_pending' THEN 'refund_pending'
        WHEN b.status = 'cancelled' AND o.status = 'refunded' THEN 'refunded'
        WHEN b.status = 'no_show' THEN 'no_show'
        ELSE 'success'
      END AS secondary_state,
      COALESCE(lm.sender_role = 'traveler', false) AS needs_reply,
      o.contact_name AS display_name,
      CASE
        WHEN o.contact_email ~ '^[^@]+@[^@]+$'
          THEN left(o.contact_email, 1) || '***@' || split_part(o.contact_email, '@', 2)
        ELSE NULL
      END AS email_masked,
      b.activity_id,
      b.activity_plan_id,
      a.title AS activity_title,
      ap.name AS plan_name,
      ap.booking_type,
      date_trunc('milliseconds', b.start_at) AS start_at,
      b.end_at,
      b.timezone,
      b.participants AS party_size,
      o.total_twd,
      o.payment_deadline_at,
      b.created_at AS received_at,
      date_trunc('milliseconds', greatest(b.updated_at, o.updated_at, COALESCE(lm.created_at, '-infinity'::timestamptz))) AS updated_at,
      lm.created_at AS last_message_at
    FROM public.bookings b
    JOIN public.orders o
      ON o.booking_id = b.id
     AND o.id = b.order_id
    JOIN public.activity_plans ap
      ON ap.id = b.activity_plan_id
     AND ap.booking_type = 'request'
    JOIN public.activities a
      ON a.id = b.activity_id
    LEFT JOIN LATERAL (
      SELECT om.id, om.sender_role, om.created_at
      FROM public.order_messages om
      WHERE om.order_id = o.id
      ORDER BY om.created_at DESC, om.id DESC
      LIMIT 1
    ) lm ON true
    WHERE b.guide_id = p_guide_id
  ), classified AS (
    SELECT
      s.*,
      CASE s.bucket
        WHEN 'needs_reply' THEN 0
        WHEN 'new' THEN 1
        WHEN 'replied' THEN 2
        ELSE 3
      END AS priority_rank
    FROM state_rows s
  )
  SELECT
    c.booking_id,
    c.guide_id,
    c.order_id,
    c.booking_no,
    c.booking_status,
    c.guide_approval_status,
    c.order_status,
    c.bucket,
    c.secondary_state,
    c.needs_reply,
    c.display_name,
    c.email_masked,
    c.activity_id,
    c.activity_plan_id,
    c.activity_title,
    c.plan_name,
    c.booking_type,
    c.start_at,
    c.end_at,
    c.timezone,
    c.party_size,
    c.total_twd,
    c.payment_deadline_at,
    c.received_at,
    c.updated_at,
    c.last_message_at,
    c.priority_rank
  FROM classified c
  WHERE (p_bucket = 'all' OR c.bucket = p_bucket)
    AND (
      p_cursor_rank IS NULL
      OR CASE p_sort
        WHEN 'priority' THEN
          c.priority_rank > p_cursor_rank
          OR (c.priority_rank = p_cursor_rank AND (
            c.updated_at < p_cursor_at
            OR (c.updated_at = p_cursor_at AND c.booking_id < p_cursor_id)
          ))
        WHEN 'updated_desc' THEN
          c.updated_at < p_cursor_at
          OR (c.updated_at = p_cursor_at AND c.booking_id < p_cursor_id)
        WHEN 'service_asc' THEN
          c.start_at > p_cursor_at
          OR (c.start_at = p_cursor_at AND c.booking_id > p_cursor_id)
      END
    )
  ORDER BY
    CASE WHEN p_sort = 'priority' THEN c.priority_rank END ASC,
    CASE WHEN p_sort IN ('priority', 'updated_desc') THEN c.updated_at END DESC,
    CASE WHEN p_sort IN ('priority', 'updated_desc') THEN c.booking_id END DESC,
    CASE WHEN p_sort = 'service_asc' THEN c.start_at END ASC,
    CASE WHEN p_sort = 'service_asc' THEN c.booking_id END ASC
  LIMIT p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.midao_list_booking_requests(uuid, text, text, integer, timestamptz, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.midao_list_booking_requests(uuid, text, text, integer, timestamptz, uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_list_booking_requests(uuid, text, text, integer, timestamptz, uuid, integer) TO service_role;

COMMIT;
