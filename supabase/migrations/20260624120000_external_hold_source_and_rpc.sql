-- =============================================================
-- 20260624120000_external_hold_source_and_rpc.sql
-- 導遊「外部佔位」（external hold）：把外部通路（OTA／電話／現場走客）
-- 已售出的座位登記進平台庫存，讓所有線上通路共用同一個 booked_count，
-- 從根本杜絕外部來源造成的超賣。
--
-- 設計重點：
--   1. 外部佔位 = 一筆 bookings 列（source_channel='external'、status='external_hold'），
--      重用既有的群組容量規則（CAPACITY_HOLD_BOOKING_STATUSES）與衝突偵測。
--   2. 座位扣減一律走既有 fn_book_schedule / fn_cancel_booking（FOR UPDATE 行鎖），
--      與線上付款回調共用同一個原子寫入點，不另開平行庫存表。
--   3. fn_create_external_hold 在「同一個交易」內完成「扣 booked_count + 寫 bookings 列」，
--      任一步失敗整個函式 rollback（含 fn_book_schedule 的扣量），不會留下孤兒佔位。
--
-- 變更皆為 additive：放寬既有 CHECK 約束、bookings 新增 nullable schedule_id、新增 RPC。
-- 既有流程（draft/checkout/payment callback）行為不變。
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. 放寬 source_channel：bookings / orders 允許 'external'
-- -------------------------------------------------------------
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_source_channel_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_source_channel_check
  CHECK (source_channel IN ('web', 'line', 'admin_pos', 'external'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_channel_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_source_channel_check
  CHECK (source_channel IN ('web', 'line', 'admin_pos', 'external'));

-- -------------------------------------------------------------
-- 2. 放寬 bookings.status：允許 'external_hold'
-- -------------------------------------------------------------
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'draft', 'pending_confirmation', 'confirmed', 'completed',
    'cancelled', 'no_show', 'reschedule_requested', 'external_hold'
  ));

-- -------------------------------------------------------------
-- 3. bookings 新增 nullable schedule_id（外部佔位釋放時用來退還座位）
--    既有 booking↔order↔schedule 透過 orders.schedule_id 關聯；外部佔位沒有 order，
--    需在 booking 上直接記錄 schedule_id 才能於釋放時呼叫 fn_cancel_booking。
--    既有流程不寫入此欄（維持 NULL），無行為變更。
-- -------------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES activity_schedules(id);

CREATE INDEX IF NOT EXISTS idx_bookings_schedule_id ON bookings(schedule_id);

-- -------------------------------------------------------------
-- 4. fn_create_external_hold：原子建立外部佔位
--    流程（全部在同一交易內）：
--      a. 鎖定並驗證 schedule
--      b. ownership：schedule 所屬 activity 必須屬於該 guide
--      c. fn_book_schedule 扣 booked_count（既有 FOR UPDATE + 容量檢查）
--      d. insert 一筆 bookings（external / external_hold）
--      e. 寫 booking_status_logs
--    任一步驟丟出例外 → 整個函式 rollback（含 c 的扣量），不留孤兒佔位。
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_create_external_hold(
  p_schedule_id uuid,
  p_count integer,
  p_guide_id uuid,
  p_activity_plan_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
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
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------
-- 5. fn_release_external_hold：原子釋放外部佔位
--    鎖定 booking → 驗證為自己的 external_hold → fn_cancel_booking 退量 →
--    標記 booking cancelled → 寫稽核。
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_release_external_hold(
  p_booking_id uuid,
  p_guide_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
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
$$ LANGUAGE plpgsql;

COMMIT;
