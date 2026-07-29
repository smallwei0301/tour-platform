-- 20260727120000_midao2_instant_booking.sql
-- midao2 直接預約（instant booking）狀態機擴充＋消耗帳表
-- spec: docs/superpowers/specs/2026-07-27-midao2-instant-booking-design.md §2
-- owner 決策（2026-07-27 對話拍板）：新增獨立狀態 confirmed／cancelled；
-- 只有 status='confirmed' 的 instant 單消耗單位（唯一索引即原子鎖）。只增不改既有檔。

-- (1) midao_requests：狀態機擴充＋全天時段值＋單別
ALTER TABLE midao_requests DROP CONSTRAINT IF EXISTS midao_requests_status_check;
ALTER TABLE midao_requests ADD CONSTRAINT midao_requests_status_check
  CHECK (status IN ('new','pending_reply','replied','closed_won','closed_done','confirmed','cancelled'));

ALTER TABLE midao_requests DROP CONSTRAINT IF EXISTS midao_requests_preferred_period_check;
ALTER TABLE midao_requests ADD CONSTRAINT midao_requests_preferred_period_check
  CHECK (preferred_period IN ('morning','afternoon','evening','full_day'));

ALTER TABLE midao_requests ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'request'
  CHECK (kind IN ('request','instant'));

-- (2) 單位消耗帳（防撞單的原子性來源；unique partial index 即原子鎖，見 spec §2）
CREATE TABLE IF NOT EXISTS midao_slot_consumptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id    uuid        NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  request_id  uuid        NOT NULL REFERENCES midao_requests(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  period      text        NOT NULL CHECK (period IN ('morning','afternoon','evening')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_midao_slot_active
  ON midao_slot_consumptions(guide_id, date, period) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_midao_slot_by_request ON midao_slot_consumptions(request_id);

-- server 端一律走 service-role；RLS 開啟＋不建 policy＝anon/authenticated 預設拒絕（比照 20260722100000）
ALTER TABLE midao_slot_consumptions ENABLE ROW LEVEL SECURITY;
