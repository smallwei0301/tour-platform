-- Issue #1383 — 訂單改期（第一期：同活動同方案同價，不動金流）
-- 設計：docs/04-tech/04-tech-architecture/13-order-reschedule-design.md
-- 鎖序規範：orders → bookings → activity_schedules（見 12-payment-callback-atomicity.md）
-- Safety: idempotent DDL。

CREATE TABLE IF NOT EXISTS public.reschedule_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  request_id          text NOT NULL,
  from_schedule_id    uuid,
  to_schedule_id      uuid NOT NULL,
  from_start_at       timestamptz,
  to_start_at         timestamptz,
  status              text NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested','approved','rejected','withdrawn','expired')),
  prior_order_status  text NOT NULL,
  -- 第二期跨價方案預留（第一期恆為 0，不動金流）
  amount_delta_twd    integer NOT NULL DEFAULT 0,
  resolver            text,
  note                text,
  requested_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 申請冪等（client requestId）
CREATE UNIQUE INDEX IF NOT EXISTS reschedule_requests_order_request_unique
  ON public.reschedule_requests (order_id, request_id);

CREATE INDEX IF NOT EXISTS reschedule_requests_status_idx
  ON public.reschedule_requests (status, requested_at DESC);

ALTER TABLE public.reschedule_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reschedule_requests_service_all ON public.reschedule_requests;
CREATE POLICY reschedule_requests_service_all ON public.reschedule_requests
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_reschedule_booking_atomic：嚮導核准改期的原子轉移。
-- 單一交易內：鎖訂單 → 鎖 booking（如有）→ 依 id 排序鎖兩場次 → 新場次容量
-- 檢查 → 新扣舊補 → 訂單/booking 指向新場次並回復原狀態 → request approved
-- → audit log。任何失敗 RAISE EXCEPTION 全量回滾，舊預訂不受影響。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_reschedule_booking_atomic(
  p_request_id uuid,
  p_resolver   text DEFAULT 'guide'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
