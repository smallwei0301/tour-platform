-- 20260722100000_midao2_requests_availability.sql
-- midao2 接案 CRM（spec: docs/superpowers/specs/2026-07-22-midao2-guide-backend-design.md §4.2/§4.4）
-- 新表 ×3：旅客需求單、週可用時間預設、單日覆寫。只增不改。

CREATE TABLE IF NOT EXISTS midao_requests (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no              text        UNIQUE NOT NULL,
  guide_id                uuid        NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  activity_id             uuid        REFERENCES activities(id) ON DELETE SET NULL,
  activity_title_snapshot text,
  traveler_name           text        NOT NULL,
  traveler_line_id        text,
  traveler_email          text,
  preferred_date          date        NOT NULL,
  backup_date             date,
  preferred_period        text        CHECK (preferred_period IN ('morning','afternoon','evening')),
  start_time              time,
  end_time                time,
  participants_count      integer     NOT NULL DEFAULT 1,
  participants_note       text,
  language                text,
  need_pickup             boolean     NOT NULL DEFAULT false,
  special_note            text,
  answers                 jsonb       NOT NULL DEFAULT '[]',
  status                  text        NOT NULL DEFAULT 'new'
                            CHECK (status IN ('new','pending_reply','replied','closed_won','closed_done')),
  source                  text        NOT NULL DEFAULT 'public_page'
                            CHECK (source IN ('public_page','manual')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  status_changed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_midao_requests_guide_status ON midao_requests(guide_id, status);
CREATE INDEX IF NOT EXISTS idx_midao_requests_guide_date   ON midao_requests(guide_id, preferred_date);

CREATE TABLE IF NOT EXISTS midao_availability_defaults (
  id       uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid     NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  weekday  smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  period   text     NOT NULL CHECK (period IN ('morning','afternoon','evening')),
  is_open  boolean  NOT NULL DEFAULT false,
  UNIQUE (guide_id, weekday, period)
);

CREATE TABLE IF NOT EXISTS midao_day_overrides (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id     uuid        NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  date         date        NOT NULL,
  period       text        NOT NULL CHECK (period IN ('morning','afternoon','evening','custom')),
  is_open      boolean     NOT NULL DEFAULT true,
  custom_start time,
  custom_end   time,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 非 custom 時段每日唯一（custom 可多筆）
CREATE UNIQUE INDEX IF NOT EXISTS uq_midao_day_overrides_period
  ON midao_day_overrides(guide_id, date, period) WHERE period <> 'custom';
CREATE INDEX IF NOT EXISTS idx_midao_day_overrides_guide_date ON midao_day_overrides(guide_id, date);

-- server 端一律走 service-role；RLS 開啟＋不建 policy＝anon/authenticated 預設拒絕
ALTER TABLE midao_requests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE midao_availability_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE midao_day_overrides         ENABLE ROW LEVEL SECURITY;
