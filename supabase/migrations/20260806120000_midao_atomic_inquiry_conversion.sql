-- Issue #1759 Package 4 Task 38: atomic inquiry -> booking conversion command.
-- Forward-only and additive. Do not apply this migration to production here.
--
-- 本檔交付三支 RPC（同批，不得拆開）：
--   1. public.midao_convert_inquiry_to_booking  — 導遊把 inquiry 轉成 booking（單一交易原子命令）
--   2. public.midao_accept_traveler_confirmation — 旅客以一次性 token 確認
--   3. public.midao_expire_stale_confirmation_atomic — 確認逾期回收（與付款逾時互為冪等 noop）
--
-- canonical lock hierarchy（只能遞增取鎖，允許跳層，不得回頭）：
--   1. public.midao_idempotency_records     (INSERT claim ON CONFLICT DO NOTHING -> 未搶到才 FOR UPDATE)
--   2. public.guide_inquiries               (FOR UPDATE，僅 conversion)
--   3. public.midao_booking_capacity_locks  (INSERT ON CONFLICT DO NOTHING -> FOR UPDATE)
--   4. public.orders                        (conversion=INSERT／accept・expire=FOR UPDATE)
--   5. public.bookings                      (conversion=INSERT／accept・expire=FOR UPDATE)
--   6. public.activity_schedules            (三支 RPC 皆不觸及；request 型結構性無 schedule)
--   7. public.booking_confirmation_tokens   (conversion=INSERT／accept・expire=最後 FOR UPDATE)
--
-- conversion 的互斥保證來自層 1（idempotency unique claim）＋層 2（inquiry FOR UPDATE）
-- ＋層 3（capacity mutex row），而非「orders -> bookings -> schedules」的插入順序。
--
-- 誠實邊界：本檔只序列化 inquiry conversion vs inquiry conversion。conversion vs 旅客自助
-- 下單（POST /api/v2/bookings/draft）的超賣視窗仍存在，追蹤於 #1795。
--
-- 交易內禁止任何外部呼叫（無 http／pg_net／net.http_post）；通知一律寫 midao_notification_outbox。

-- ---------------------------------------------------------------------------
-- Step 1：capacity mutex 表
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.midao_booking_capacity_locks (
  guide_id UUID NOT NULL REFERENCES public.guide_profiles(id) ON DELETE CASCADE,
  activity_plan_id UUID NOT NULL REFERENCES public.activity_plans(id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  touched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guide_id, activity_plan_id, local_date)
);

ALTER TABLE public.midao_booking_capacity_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midao_booking_capacity_locks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.midao_booking_capacity_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.midao_booking_capacity_locks TO service_role;

COMMENT ON TABLE public.midao_booking_capacity_locks IS
  'Canonical mutex rows for request-type guide/plan/local-date capacity serialization. Rows carry no business data and must never be deleted by rollback.';
COMMENT ON COLUMN public.midao_booking_capacity_locks.local_date IS
  'Asia/Taipei local date derived as (start_at AT TIME ZONE ''Asia/Taipei'')::date; must match JS getLocalDateInTimezone().';

-- ---------------------------------------------------------------------------
-- Step 2：conversion RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.midao_convert_inquiry_to_booking(
  p_guide_id uuid,
  p_actor_type text,
  p_actor_id text,
  p_inquiry_id uuid,
  p_activity_plan_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_participants integer,
  p_quoted_total_twd integer,
  p_guide_note text,
  p_confirmation_ttl_hours integer,
  p_confirmation_token_hash text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
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
  v_guide_note text;
  v_token_hash text;
  v_idempotency_key text;
  v_request_hash text;
  v_idempotency_id uuid;
  v_idempotency_state text;
  v_stored_hash text;
  v_replay_body jsonb;
  v_claimed boolean := false;
  v_now timestamptz;
  v_local_date date;
  v_inquiry public.guide_inquiries%ROWTYPE;
  v_plan public.activity_plans%ROWTYPE;
  v_plan_guide_id uuid;
  v_existing_participants integer := 0;
  v_order_id uuid;
  v_booking_id uuid;
  v_booking_no text;
  v_confirmation_expires_at timestamptz;
  v_payment_deadline_at timestamptz;
  v_sanitized_body jsonb;
  v_replay_belongs boolean;
BEGIN
  -- 參數前置驗證（全部 22023）
  IF p_guide_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_GUIDE_ID';
  END IF;
  IF p_inquiry_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_INQUIRY_ID';
  END IF;
  IF p_activity_plan_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PLAN_ID';
  END IF;

  v_actor_type := pg_catalog.lower(pg_catalog.btrim(p_actor_type));
  v_actor_id := pg_catalog.btrim(p_actor_id);
  IF v_actor_type IS NULL OR v_actor_type NOT IN ('guide', 'admin')
     OR v_actor_id IS NULL OR v_actor_id = ''
     OR pg_catalog.octet_length(v_actor_id) > 128 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTOR';
  END IF;

  IF p_start_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_START_AT';
  END IF;
  IF p_end_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_END_AT';
  END IF;
  IF p_end_at <= p_start_at THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'END_NOT_AFTER_START';
  END IF;
  IF p_participants IS NULL OR p_participants < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PARTICIPANTS';
  END IF;
  IF p_quoted_total_twd IS NULL OR p_quoted_total_twd < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_QUOTED_TOTAL';
  END IF;
  IF p_confirmation_ttl_hours IS NULL OR p_confirmation_ttl_hours < 1 OR p_confirmation_ttl_hours > 24 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TTL_OUT_OF_BOUNDS';
  END IF;

  v_token_hash := pg_catalog.lower(pg_catalog.btrim(p_confirmation_token_hash));
  IF v_token_hash IS NULL OR v_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CONFIRMATION_TOKEN_HASH';
  END IF;

  v_guide_note := NULLIF(pg_catalog.btrim(p_guide_note), '');
  IF v_guide_note IS NOT NULL AND pg_catalog.octet_length(v_guide_note) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_GUIDE_NOTE';
  END IF;

  v_idempotency_key := NULLIF(pg_catalog.btrim(p_idempotency_key), '');
  IF v_idempotency_key IS NULL OR pg_catalog.octet_length(v_idempotency_key) > 128 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  v_request_hash := pg_catalog.lower(pg_catalog.btrim(p_request_hash));
  IF v_request_hash IS NULL OR v_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REQUEST_HASH';
  END IF;

  v_now := pg_catalog.now();

  -- 層 1：idempotency claim
  INSERT INTO public.midao_idempotency_records (
    actor_type, actor_id, command_name, scope_type, scope_id,
    idempotency_key, request_hash, state, expires_at
  ) VALUES (
    v_actor_type, v_actor_id, 'convert_inquiry_to_booking', 'inquiry', p_inquiry_id,
    v_idempotency_key, v_request_hash, 'processing', v_now + INTERVAL '1 day'
  )
  ON CONFLICT (scope_type, scope_id, command_name, idempotency_key) DO NOTHING
  RETURNING id INTO v_idempotency_id;
  v_claimed := FOUND;

  IF NOT v_claimed THEN
    SELECT r.id, r.state, r.request_hash, r.response_body
    INTO v_idempotency_id, v_idempotency_state, v_stored_hash, v_replay_body
    FROM public.midao_idempotency_records AS r
    WHERE r.scope_type = 'inquiry'
      AND r.scope_id = p_inquiry_id
      AND r.command_name = 'convert_inquiry_to_booking'
      AND r.idempotency_key = v_idempotency_key
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
    END IF;
  END IF;

  -- 層 2：inquiry FOR UPDATE
  SELECT * INTO v_inquiry FROM public.guide_inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'INQUIRY_NOT_FOUND';
  END IF;
  IF v_inquiry.guide_id IS DISTINCT FROM p_guide_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'INQUIRY_NOT_FOUND';
  END IF;

  -- 層 3：capacity mutex（唯一 local_date 計算式）
  v_local_date := (p_start_at AT TIME ZONE 'Asia/Taipei')::date;

  INSERT INTO public.midao_booking_capacity_locks (guide_id, activity_plan_id, local_date)
  VALUES (p_guide_id, p_activity_plan_id, v_local_date)
  ON CONFLICT (guide_id, activity_plan_id, local_date) DO NOTHING;

  PERFORM 1
  FROM public.midao_booking_capacity_locks
  WHERE guide_id = p_guide_id
    AND activity_plan_id = p_activity_plan_id
    AND local_date = v_local_date
  FOR UPDATE;

  -- replay 分支：取完層 2／3 的鎖之後、任何寫入之前
  IF NOT v_claimed THEN
    IF v_stored_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_CONFLICT';
    END IF;
    IF v_idempotency_state = 'processing' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_IN_PROGRESS';
    END IF;
    IF v_idempotency_state <> 'completed' OR v_replay_body IS NULL OR v_replay_body = 'null'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
    END IF;

    SELECT (t.token_hash = v_token_hash)
    INTO v_replay_belongs
    FROM public.booking_confirmation_tokens AS t
    WHERE t.booking_id = (v_replay_body->>'booking_id')::uuid;

    RETURN v_replay_body
      || pg_catalog.jsonb_build_object(
           'created', false,
           'replayed', true,
           'confirmation_token_belongs_to_caller', COALESCE(v_replay_belongs, false)
         );
  END IF;

  -- 層 2b：R4 修正 —— UNIQUE 只作最後防線，這裡先顯式攔下
  IF v_inquiry.converted_booking_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INQUIRY_ALREADY_CONVERTED',
      DETAIL = pg_catalog.jsonb_build_object('bookingId', v_inquiry.converted_booking_id)::text;
  END IF;

  -- 層 2c：RPC 內部防禦深度重驗（D1–D11，資料以 DB 當下為準）
  IF v_inquiry.status NOT IN ('replied', 'ready_to_convert') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INQUIRY_STATE_NOT_CONVERTIBLE';
  END IF;

  SELECT * INTO v_plan FROM public.activity_plans WHERE id = p_activity_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PLAN_NOT_FOUND';
  END IF;
  IF v_plan.activity_id IS DISTINCT FROM v_inquiry.activity_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLAN_ACTIVITY_MISMATCH';
  END IF;

  SELECT a.guide_id INTO v_plan_guide_id FROM public.activities AS a WHERE a.id = v_plan.activity_id;
  IF v_plan_guide_id IS DISTINCT FROM p_guide_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLAN_GUIDE_MISMATCH';
  END IF;
  IF v_plan.status <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLAN_INACTIVE';
  END IF;
  IF v_plan.booking_type <> 'request' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLAN_BOOKING_TYPE_NOT_REQUEST';
  END IF;
  IF p_participants < v_plan.min_participants THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PARTICIPANTS_BELOW_PLAN_MIN';
  END IF;
  IF p_participants > v_plan.max_participants THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PARTICIPANTS_ABOVE_PLAN_MAX';
  END IF;

  -- D11／N5：bookings.traveler_id 指向 public.users，不得讓 23503 裸奔
  PERFORM 1 FROM public.users WHERE id = v_inquiry.traveler_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'TRAVELER_PROFILE_NOT_FOUND';
  END IF;

  -- 層 3b：容量重算（持鎖後才算）
  SELECT COALESCE(pg_catalog.sum(b.participants), 0)
  INTO v_existing_participants
  FROM public.bookings AS b
  WHERE b.activity_id = v_inquiry.activity_id
    AND b.activity_plan_id = p_activity_plan_id
    AND b.status IN ('draft', 'external_hold', 'pending_confirmation', 'confirmed', 'reschedule_requested')
    AND (b.start_at AT TIME ZONE 'Asia/Taipei')::date = v_local_date;

  IF v_existing_participants + p_participants > v_plan.max_participants THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CAPACITY_EXCEEDED';
  END IF;

  v_payment_deadline_at := v_now + INTERVAL '24 hours';
  v_confirmation_expires_at := v_now + (p_confirmation_ttl_hours || ' hours')::interval;

  -- 層 4：orders INSERT（booking_id 先留 NULL，schedule_id 結構性留 NULL，booking_no 由 trigger 產生）
  INSERT INTO public.orders (
    booking_id, activity_id, schedule_id, user_id, people_count,
    contact_name, contact_phone, contact_email,
    status, payment_status, total_twd, source_channel, discount_amount,
    payment_deadline_at, created_at, updated_at
  ) VALUES (
    NULL, v_inquiry.activity_id, NULL, v_inquiry.traveler_user_id, p_participants,
    NULLIF(pg_catalog.btrim(p_contact_name), ''),
    NULLIF(pg_catalog.btrim(p_contact_phone), ''),
    NULLIF(pg_catalog.btrim(p_contact_email), ''),
    'pending_payment', 'pending', p_quoted_total_twd, 'line', 0,
    v_payment_deadline_at, v_now, v_now
  )
  RETURNING id INTO v_order_id;

  -- 層 5：bookings INSERT（booking_no 由 trigger 產生；customer_note 必須留 NULL）
  INSERT INTO public.bookings (
    traveler_id, guide_id, activity_id, activity_plan_id, source_channel,
    start_at, end_at, timezone, participants, status,
    guide_approval_status, guide_approval_decided_at, guide_approval_note,
    order_id, source_inquiry_id,
    traveler_confirmation_status, traveler_confirmation_expires_at,
    customer_note, created_at, updated_at
  ) VALUES (
    v_inquiry.traveler_user_id, p_guide_id, v_inquiry.activity_id, p_activity_plan_id, 'line',
    p_start_at, p_end_at, 'Asia/Taipei', p_participants, 'draft',
    'approved', v_now, v_guide_note,
    v_order_id, p_inquiry_id,
    'pending', v_confirmation_expires_at,
    NULL, v_now, v_now
  )
  RETURNING id, booking_no INTO v_booking_id, v_booking_no;

  -- 層 4/5 順序註記：canonical 鎖序要求 orders 先於 bookings（與 draft route 相反），
  -- 因此這裡回頭補寫本交易剛建立的 orders 列，不引入新鎖序。
  UPDATE public.orders SET booking_id = v_booking_id, updated_at = v_now WHERE id = v_order_id;

  -- 層 5b：pricing snapshot
  INSERT INTO public.booking_pricing_snapshots (
    booking_id, source, plan_base_price_twd, quoted_total_twd, currency, party_size, created_by_guide_id, created_at
  ) VALUES (
    v_booking_id, 'inquiry_quote', v_plan.base_price, p_quoted_total_twd, 'TWD', p_participants, p_guide_id, v_now
  );

  -- 層 5c：intake responses（原樣搬運）
  INSERT INTO public.booking_intake_responses (booking_id, questionnaire_snapshot, answers, created_at)
  VALUES (v_booking_id, v_inquiry.questionnaire_snapshot, v_inquiry.answers, v_now);

  -- 層 6：activity_schedules 跳過（request 型結構性無 schedule；禁止呼叫 fn_book_schedule）

  -- 層 7：confirmation token（與 bookings.traveler_confirmation_expires_at 同一變數）
  INSERT INTO public.booking_confirmation_tokens (booking_id, token_hash, expires_at, consumed_at, created_at)
  VALUES (v_booking_id, v_token_hash, v_confirmation_expires_at, NULL, v_now);

  -- 層 7b：status log
  INSERT INTO public.booking_status_logs (
    booking_id, from_status, to_status, actor_user_id, actor_role, reason, metadata, created_at
  ) VALUES (
    v_booking_id, NULL, 'draft', NULL, v_actor_type, 'inquiry_converted',
    pg_catalog.jsonb_build_object('inquiryId', p_inquiry_id, 'orderId', v_order_id), v_now
  );

  -- 層 7c：outbox（payload 絕不含 raw token 或 token_hash）
  INSERT INTO public.midao_notification_outbox (event_name, aggregate_type, aggregate_id, payload, created_at)
  VALUES (
    'booking.converted_from_inquiry', 'booking', v_booking_id::text,
    pg_catalog.jsonb_build_object(
      'bookingId', v_booking_id,
      'orderId', v_order_id,
      'inquiryId', p_inquiry_id,
      'travelerUserId', v_inquiry.traveler_user_id,
      'travelerConfirmationExpiresAt', v_confirmation_expires_at,
      'paymentDeadlineAt', v_payment_deadline_at
    ),
    v_now
  );

  -- 層 7d：converted_booking_id CAS 回寫
  UPDATE public.guide_inquiries
  SET converted_booking_id = v_booking_id,
      status = 'converted',
      updated_at = v_now
  WHERE id = p_inquiry_id
    AND converted_booking_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INQUIRY_ALREADY_CONVERTED';
  END IF;

  v_sanitized_body := pg_catalog.jsonb_build_object(
    'created', true,
    'replayed', false,
    'booking_id', v_booking_id,
    'order_id', v_order_id,
    'inquiry_id', p_inquiry_id,
    'booking_no', v_booking_no,
    'booking_status', 'draft',
    'traveler_confirmation_status', 'pending',
    'traveler_confirmation_expires_at', v_confirmation_expires_at
  );

  -- 層 8：idempotency 完成回寫（持久化的是 v_sanitized_body，不含 belongs_to_caller）
  UPDATE public.midao_idempotency_records
  SET state = 'completed',
      response_status = 200,
      response_body = v_sanitized_body,
      resource_type = 'booking',
      resource_id = v_booking_id::text,
      locked_at = v_now,
      completed_at = v_now
  WHERE id = v_idempotency_id
    AND state = 'processing';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
  END IF;

  RETURN v_sanitized_body || pg_catalog.jsonb_build_object('confirmation_token_belongs_to_caller', true);
END;
$midao$;

-- ---------------------------------------------------------------------------
-- Step 3a：traveler confirmation accept RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.midao_accept_traveler_confirmation(
  p_traveler_user_id uuid,
  p_confirmation_token_hash text,
  p_idempotency_key text,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $midao$
DECLARE
  v_token_hash text;
  v_idempotency_key text;
  v_request_hash text;
  v_idempotency_id uuid;
  v_idempotency_state text;
  v_stored_hash text;
  v_replay_body jsonb;
  v_claimed boolean := false;
  v_now timestamptz;
  v_booking_id uuid;
  v_local_date date;
  v_booking public.bookings%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_token public.booking_confirmation_tokens%ROWTYPE;
  v_plan public.activity_plans%ROWTYPE;
  v_others integer := 0;
  v_lock_guide_id uuid;
  v_lock_plan_id uuid;
  v_sanitized_body jsonb;
BEGIN
  IF p_traveler_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TRAVELER_ID';
  END IF;
  v_token_hash := pg_catalog.lower(pg_catalog.btrim(p_confirmation_token_hash));
  IF v_token_hash IS NULL OR v_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CONFIRMATION_TOKEN_HASH';
  END IF;
  v_idempotency_key := NULLIF(pg_catalog.btrim(p_idempotency_key), '');
  IF v_idempotency_key IS NULL OR pg_catalog.octet_length(v_idempotency_key) > 128 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  v_request_hash := pg_catalog.lower(pg_catalog.btrim(p_request_hash));
  IF v_request_hash IS NULL OR v_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REQUEST_HASH';
  END IF;

  v_now := pg_catalog.now();

  -- 步驟 1：非鎖定解析 token -> booking_id（僅用來決定要鎖哪一列，不可信任）
  SELECT t.booking_id INTO v_booking_id
  FROM public.booking_confirmation_tokens AS t
  WHERE t.token_hash = v_token_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'CONFIRMATION_TOKEN_NOT_FOUND';
  END IF;

  -- 層 1：idempotency claim
  INSERT INTO public.midao_idempotency_records (
    actor_type, actor_id, command_name, scope_type, scope_id,
    idempotency_key, request_hash, state, expires_at
  ) VALUES (
    'traveler', p_traveler_user_id::text, 'accept_traveler_confirmation', 'booking', v_booking_id,
    v_idempotency_key, v_request_hash, 'processing', v_now + INTERVAL '1 day'
  )
  ON CONFLICT (scope_type, scope_id, command_name, idempotency_key) DO NOTHING
  RETURNING id INTO v_idempotency_id;
  v_claimed := FOUND;

  IF NOT v_claimed THEN
    SELECT r.id, r.state, r.request_hash, r.response_body
    INTO v_idempotency_id, v_idempotency_state, v_stored_hash, v_replay_body
    FROM public.midao_idempotency_records AS r
    WHERE r.scope_type = 'booking'
      AND r.scope_id = v_booking_id
      AND r.command_name = 'accept_traveler_confirmation'
      AND r.idempotency_key = v_idempotency_key
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
    END IF;
  END IF;

  -- 層 3：capacity mutex（key 由未鎖定讀取得；讀錯會在層 5／7 的鎖定重讀被抓出並整筆 rollback）
  SELECT b.guide_id, b.activity_plan_id, (b.start_at AT TIME ZONE 'Asia/Taipei')::date
  INTO v_lock_guide_id, v_lock_plan_id, v_local_date
  FROM public.bookings AS b
  WHERE b.id = v_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'CONFIRMATION_TOKEN_NOT_FOUND';
  END IF;

  INSERT INTO public.midao_booking_capacity_locks (guide_id, activity_plan_id, local_date)
  VALUES (v_lock_guide_id, v_lock_plan_id, v_local_date)
  ON CONFLICT (guide_id, activity_plan_id, local_date) DO NOTHING;

  PERFORM 1
  FROM public.midao_booking_capacity_locks
  WHERE guide_id = v_lock_guide_id
    AND activity_plan_id = v_lock_plan_id
    AND local_date = v_local_date
  FOR UPDATE;

  -- 層 4：orders FOR UPDATE（先於 bookings，證明鎖序未反向）
  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.booking_id = v_booking_id
  ORDER BY o.created_at, o.id
  FOR UPDATE
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
  END IF;

  -- 層 5：bookings FOR UPDATE + 重驗
  SELECT * INTO v_booking FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'CONFIRMATION_TOKEN_NOT_FOUND';
  END IF;

  -- replay 分支：取完層 1／3／4／5 的鎖之後、任何寫入之前
  IF NOT v_claimed THEN
    IF v_stored_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_CONFLICT';
    END IF;
    IF v_idempotency_state = 'processing' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IDEMPOTENCY_IN_PROGRESS';
    END IF;
    IF v_idempotency_state <> 'completed' OR v_replay_body IS NULL OR v_replay_body = 'null'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
    END IF;
    RETURN v_replay_body || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_booking.traveler_id IS DISTINCT FROM p_traveler_user_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'CONFIRMATION_TOKEN_NOT_FOUND';
  END IF;
  IF v_booking.status <> 'draft' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CONFIRMATION_TOKEN_EXPIRED';
  END IF;
  IF v_booking.traveler_confirmation_status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CONFIRMATION_TOKEN_ALREADY_CONSUMED';
  END IF;
  IF v_booking.traveler_confirmation_expires_at IS NULL
     OR v_booking.traveler_confirmation_expires_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CONFIRMATION_TOKEN_EXPIRED';
  END IF;

  -- 層 7（最後）：token FOR UPDATE 重讀驗證
  SELECT * INTO v_token
  FROM public.booking_confirmation_tokens
  WHERE booking_id = v_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'CONFIRMATION_TOKEN_NOT_FOUND';
  END IF;
  IF v_token.token_hash IS DISTINCT FROM v_token_hash THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'CONFIRMATION_TOKEN_NOT_FOUND';
  END IF;
  IF v_token.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CONFIRMATION_TOKEN_ALREADY_CONSUMED';
  END IF;
  IF v_token.expires_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CONFIRMATION_TOKEN_EXPIRED';
  END IF;

  -- 容量 revalidation（持有層 3 mutex 時執行；純 SQL 排除自身 hold）
  SELECT * INTO v_plan FROM public.activity_plans WHERE id = v_booking.activity_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PLAN_NOT_FOUND';
  END IF;

  SELECT COALESCE(pg_catalog.sum(b.participants), 0)
  INTO v_others
  FROM public.bookings AS b
  WHERE b.activity_id = v_booking.activity_id
    AND b.activity_plan_id = v_booking.activity_plan_id
    AND b.status IN ('draft', 'external_hold', 'pending_confirmation', 'confirmed', 'reschedule_requested')
    AND (b.start_at AT TIME ZONE 'Asia/Taipei')::date = v_local_date
    AND b.id <> v_booking_id;

  IF v_others + v_booking.participants > v_plan.max_participants THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CAPACITY_EXCEEDED';
  END IF;

  -- CAS 消費（禁止呼叫 fn_book_schedule、禁止動 bookings.status 與 payment_deadline_at）
  UPDATE public.booking_confirmation_tokens
  SET consumed_at = v_now
  WHERE booking_id = v_booking_id AND consumed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CONFIRMATION_TOKEN_ALREADY_CONSUMED';
  END IF;

  UPDATE public.bookings
  SET traveler_confirmation_status = 'confirmed', updated_at = v_now
  WHERE id = v_booking_id AND traveler_confirmation_status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CONFIRMATION_TOKEN_ALREADY_CONSUMED';
  END IF;

  INSERT INTO public.booking_status_logs (
    booking_id, from_status, to_status, actor_user_id, actor_role, reason, metadata, created_at
  ) VALUES (
    v_booking_id, 'draft', 'draft', NULL, 'traveler', 'traveler_confirmation_accepted',
    pg_catalog.jsonb_build_object('orderId', v_order.id), v_now
  );

  INSERT INTO public.midao_notification_outbox (event_name, aggregate_type, aggregate_id, payload, created_at)
  VALUES (
    'booking.traveler_confirmed', 'booking', v_booking_id::text,
    pg_catalog.jsonb_build_object(
      'bookingId', v_booking_id,
      'orderId', v_order.id,
      'travelerUserId', v_booking.traveler_id,
      'paymentDeadlineAt', v_order.payment_deadline_at
    ),
    v_now
  );

  v_sanitized_body := pg_catalog.jsonb_build_object(
    'accepted', true,
    'replayed', false,
    'booking_id', v_booking_id,
    'order_id', v_order.id,
    'booking_status', v_booking.status,
    'traveler_confirmation_status', 'confirmed',
    'payment_deadline_at', v_order.payment_deadline_at
  );

  UPDATE public.midao_idempotency_records
  SET state = 'completed',
      response_status = 200,
      response_body = v_sanitized_body,
      resource_type = 'booking',
      resource_id = v_booking_id::text,
      locked_at = v_now,
      completed_at = v_now
  WHERE id = v_idempotency_id
    AND state = 'processing';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'MIDAO_IDEMPOTENCY_RELATION_INVALID';
  END IF;

  RETURN v_sanitized_body;
END;
$midao$;

-- ---------------------------------------------------------------------------
-- Step 3b：expire-stale-confirmation RPC（無 idempotency claim，noop 冪等）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.midao_expire_stale_confirmation_atomic(
  p_booking_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $midao$
DECLARE
  v_now timestamptz;
  v_local_date date;
  v_lock_guide_id uuid;
  v_lock_plan_id uuid;
  v_booking public.bookings%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_order_id uuid;
  v_order_status text;
BEGIN
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BOOKING_ID';
  END IF;
  v_now := COALESCE(p_now, pg_catalog.now());

  SELECT b.guide_id, b.activity_plan_id, (b.start_at AT TIME ZONE 'Asia/Taipei')::date
  INTO v_lock_guide_id, v_lock_plan_id, v_local_date
  FROM public.bookings AS b
  WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('expired', false, 'reason', 'booking_not_found', 'booking_id', p_booking_id);
  END IF;

  -- 層 3：capacity mutex
  IF v_lock_plan_id IS NOT NULL THEN
    INSERT INTO public.midao_booking_capacity_locks (guide_id, activity_plan_id, local_date)
    VALUES (v_lock_guide_id, v_lock_plan_id, v_local_date)
    ON CONFLICT (guide_id, activity_plan_id, local_date) DO NOTHING;

    PERFORM 1
    FROM public.midao_booking_capacity_locks
    WHERE guide_id = v_lock_guide_id
      AND activity_plan_id = v_lock_plan_id
      AND local_date = v_local_date
    FOR UPDATE;
  END IF;

  -- 層 4：orders FOR UPDATE
  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.booking_id = p_booking_id
  ORDER BY o.created_at, o.id
  FOR UPDATE
  LIMIT 1;
  v_order_id := v_order.id;
  v_order_status := v_order.status;

  -- 層 5：bookings FOR UPDATE
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('expired', false, 'reason', 'booking_not_found', 'booking_id', p_booking_id);
  END IF;

  -- N1：已被 fn_expire_unpaid_order_atomic 取消 -> 冪等 noop，不重複寫 log／outbox
  IF v_booking.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'expired', false, 'reason', 'already_cancelled', 'booking_id', p_booking_id,
      'booking_status', v_booking.status,
      'traveler_confirmation_status', v_booking.traveler_confirmation_status
    );
  END IF;
  IF v_booking.status <> 'draft' THEN
    RETURN pg_catalog.jsonb_build_object(
      'expired', false, 'reason', 'booking_status_not_draft', 'booking_id', p_booking_id,
      'booking_status', v_booking.status
    );
  END IF;
  IF v_booking.traveler_confirmation_status <> 'pending' THEN
    RETURN pg_catalog.jsonb_build_object(
      'expired', false, 'reason', 'confirmation_not_pending', 'booking_id', p_booking_id,
      'traveler_confirmation_status', v_booking.traveler_confirmation_status
    );
  END IF;
  IF v_booking.traveler_confirmation_expires_at IS NULL
     OR v_booking.traveler_confirmation_expires_at > v_now THEN
    RETURN pg_catalog.jsonb_build_object(
      'expired', false, 'reason', 'confirmation_not_expired', 'booking_id', p_booking_id,
      'traveler_confirmation_expires_at', v_booking.traveler_confirmation_expires_at
    );
  END IF;

  -- 層 7：token FOR UPDATE（consumed_at 不動；逾期由 expires_at 表達）
  PERFORM 1 FROM public.booking_confirmation_tokens WHERE booking_id = p_booking_id FOR UPDATE;

  UPDATE public.bookings
  SET status = 'cancelled',
      cancelled_at = v_now,
      traveler_confirmation_status = 'expired',
      updated_at = v_now
  WHERE id = p_booking_id;

  IF v_order_id IS NOT NULL AND v_order_status <> 'cancelled_unpaid' THEN
    UPDATE public.orders
    SET status = 'cancelled_unpaid', updated_at = v_now
    WHERE id = v_order_id;
    v_order_status := 'cancelled_unpaid';
  END IF;

  INSERT INTO public.booking_status_logs (
    booking_id, from_status, to_status, actor_user_id, actor_role, reason, metadata, created_at
  ) VALUES (
    p_booking_id, 'draft', 'cancelled', NULL, 'system', 'traveler_confirmation_expired',
    pg_catalog.jsonb_build_object(
      'orderId', v_order_id,
      'travelerConfirmationExpiresAt', v_booking.traveler_confirmation_expires_at
    ),
    v_now
  );

  INSERT INTO public.midao_notification_outbox (event_name, aggregate_type, aggregate_id, payload, created_at)
  VALUES (
    'booking.traveler_confirmation_expired', 'booking', p_booking_id::text,
    pg_catalog.jsonb_build_object(
      'bookingId', p_booking_id,
      'orderId', v_order_id,
      'travelerUserId', v_booking.traveler_id
    ),
    v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'expired', true,
    'booking_id', p_booking_id,
    'order_id', v_order_id,
    'booking_status', 'cancelled',
    'order_status', v_order_status,
    'traveler_confirmation_status', 'expired'
  );
END;
$midao$;

-- ---------------------------------------------------------------------------
-- Step 4：ACL（參數型別清單與 CREATE FUNCTION 一字不差）
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.midao_convert_inquiry_to_booking(uuid, text, text, uuid, uuid, timestamptz, timestamptz, integer, integer, text, integer, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_convert_inquiry_to_booking(uuid, text, text, uuid, uuid, timestamptz, timestamptz, integer, integer, text, integer, text, text, text, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.midao_accept_traveler_confirmation(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_accept_traveler_confirmation(uuid, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.midao_expire_stale_confirmation_atomic(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.midao_expire_stale_confirmation_atomic(uuid, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.midao_convert_inquiry_to_booking(uuid, text, text, uuid, uuid, timestamptz, timestamptz, integer, integer, text, integer, text, text, text, text, text, text) IS
  'Atomic guide-driven inquiry to booking conversion. Mutual exclusion comes from idempotency claim, inquiry row lock, and the capacity mutex row, not from insert order.';
COMMENT ON FUNCTION public.midao_accept_traveler_confirmation(uuid, text, text, text) IS
  'Traveler one-time confirmation acceptance. Never mutates booking status, schedules, or payment deadline.';
COMMENT ON FUNCTION public.midao_expire_stale_confirmation_atomic(uuid, timestamptz) IS
  'Idempotent stale-confirmation reclaim. Returns expired=false noop when the booking was already cancelled by payment expiry.';
