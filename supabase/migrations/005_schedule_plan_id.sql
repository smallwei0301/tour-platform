-- =============================================================
-- 005_schedule_plan_id.sql
-- 場次支援「按方案」開放/關閉（為導遊後台預備）
-- =============================================================

-- 1. 新增 plan_id 欄位：對應 activities.plans[].id（如 'half-day', 'full-day'）
--    NULL = 適用於所有方案（向後相容舊資料）
ALTER TABLE activity_schedules
  ADD COLUMN IF NOT EXISTS plan_id text DEFAULT NULL;

-- 2. 新增 min_participants 欄位：最低成團人數（導遊可設定）
ALTER TABLE activity_schedules
  ADD COLUMN IF NOT EXISTS min_participants integer DEFAULT 1;

-- 3. 新增 guide_note 欄位：導遊備註（例如「當天有特別活動」）
ALTER TABLE activity_schedules
  ADD COLUMN IF NOT EXISTS guide_note text DEFAULT NULL;

-- 4. 索引：快速查詢某行程某方案的所有場次
CREATE INDEX IF NOT EXISTS idx_schedules_activity_plan
  ON activity_schedules(activity_id, plan_id);

-- 5. 唯一約束：同一行程 + 同一方案 + 同一天只能有一筆場次
--    使用 immutable helper function 提取日期（避免 timestamptz 非 immutable 問題）
CREATE OR REPLACE FUNCTION fn_schedule_date(ts timestamptz)
RETURNS date AS $$
  SELECT (ts AT TIME ZONE 'Asia/Taipei')::date;
$$ LANGUAGE sql IMMUTABLE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_unique_date_plan
  ON activity_schedules(activity_id, COALESCE(plan_id, '__all__'), fn_schedule_date(start_at));

-- 6. 自動額滿觸發器：booked_count >= capacity 時自動更新 status = 'full'
CREATE OR REPLACE FUNCTION fn_auto_full_status()
RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_full_status ON activity_schedules;
CREATE TRIGGER trg_auto_full_status
  BEFORE UPDATE OF booked_count ON activity_schedules
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_full_status();

-- 7. 安全函數：預約扣量（原子操作，避免超賣）
CREATE OR REPLACE FUNCTION fn_book_schedule(
  p_schedule_id uuid,
  p_count integer DEFAULT 1
)
RETURNS jsonb AS $$
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
$$ LANGUAGE plpgsql;

-- 8. 安全函數：取消預約退還名額
CREATE OR REPLACE FUNCTION fn_cancel_booking(
  p_schedule_id uuid,
  p_count integer DEFAULT 1
)
RETURNS jsonb AS $$
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
$$ LANGUAGE plpgsql;
