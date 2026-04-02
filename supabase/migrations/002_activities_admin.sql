-- =============================================================
-- 002_activities_admin.sql
-- Sprint 4.0 — activities + activity_schedules + guide_profiles upgrade
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Upgrade guide_profiles (add missing columns)
-- ---------------------------------------------------------------
ALTER TABLE guide_profiles
  ADD COLUMN IF NOT EXISTS slug              text,
  ADD COLUMN IF NOT EXISTS bio              text,
  ADD COLUMN IF NOT EXISTS region           text,
  ADD COLUMN IF NOT EXISTS languages        jsonb    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS specialties      jsonb    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS profile_photo_url text,
  ADD COLUMN IF NOT EXISTS verification_status text  DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS id_verified      boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS guide_license_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rating_avg       numeric(3,2),
  ADD COLUMN IF NOT EXISTS review_count     integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS headline         text,
  ADD COLUMN IF NOT EXISTS hero_image_url   text,
  ADD COLUMN IF NOT EXISTS gallery_urls     jsonb    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS service_count    integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at       timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

-- unique slug on guide_profiles
CREATE UNIQUE INDEX IF NOT EXISTS guide_profiles_slug_idx ON guide_profiles(slug);
CREATE INDEX IF NOT EXISTS guide_profiles_verification_status_idx ON guide_profiles(verification_status);
CREATE INDEX IF NOT EXISTS guide_profiles_region_idx ON guide_profiles(region);

-- ---------------------------------------------------------------
-- 2. Create activities table
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id              uuid        REFERENCES guide_profiles(id) ON DELETE SET NULL,
  guide_slug            text,                            -- denormalized for fast lookup
  title                 text        NOT NULL,
  slug                  text        UNIQUE NOT NULL,
  description           text,
  region                text,
  region_slug           text,
  category              text,
  price_twd             integer     NOT NULL DEFAULT 0,  -- price per person in TWD
  min_participants      integer     DEFAULT 1,
  max_participants      integer     DEFAULT 10,
  duration_minutes      integer,
  meeting_point         text,
  meeting_point_map_url text,
  cover_image_url       text,
  image_urls            jsonb       DEFAULT '[]',
  inclusions            jsonb       DEFAULT '[]',
  exclusions            jsonb       DEFAULT '[]',
  notices               jsonb       DEFAULT '[]',
  refund_policy_type    text        DEFAULT 'standard',
  refund_rules          jsonb       DEFAULT '[]',
  tagline               text,
  short_description     text,
  transport_mode        text,
  seo_title             text,
  seo_description       text,
  good_for              jsonb       DEFAULT '[]',
  not_good_for          jsonb       DEFAULT '[]',
  safety_notice         text,
  faq                   jsonb       DEFAULT '[]',
  status                text        NOT NULL DEFAULT 'draft',  -- draft / published / archived
  published_at          timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activities_guide_id_idx    ON activities(guide_id);
CREATE INDEX IF NOT EXISTS activities_guide_slug_idx  ON activities(guide_slug);
CREATE INDEX IF NOT EXISTS activities_region_idx      ON activities(region);
CREATE INDEX IF NOT EXISTS activities_category_idx    ON activities(category);
CREATE INDEX IF NOT EXISTS activities_status_idx      ON activities(status);

-- ---------------------------------------------------------------
-- 3. Create activity_schedules table
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_schedules (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id  uuid        NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  start_at     timestamptz NOT NULL,
  end_at       timestamptz NOT NULL,
  capacity     integer     NOT NULL DEFAULT 10,
  booked_count integer     NOT NULL DEFAULT 0,
  status       text        NOT NULL DEFAULT 'open',   -- open / full / cancelled
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_schedules_activity_id_idx ON activity_schedules(activity_id);
CREATE INDEX IF NOT EXISTS activity_schedules_start_at_idx    ON activity_schedules(start_at);
CREATE INDEX IF NOT EXISTS activity_schedules_status_idx      ON activity_schedules(status);

-- ---------------------------------------------------------------
-- 4. Refund requests (ensure table exists with correct schema)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refund_requests (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid        REFERENCES orders(id) ON DELETE CASCADE,
  reason         text        NOT NULL DEFAULT 'user_request',
  note           text,
  status         text        NOT NULL DEFAULT 'requested',
  admin_note     text,
  requested_at   timestamptz DEFAULT now(),
  approved_at    timestamptz,
  refunded_at    timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refund_requests_order_id_idx ON refund_requests(order_id);
CREATE INDEX IF NOT EXISTS refund_requests_status_idx   ON refund_requests(status);

-- ---------------------------------------------------------------
-- 5. Audit logs (ensure table exists)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id         bigserial   PRIMARY KEY,
  order_id   uuid        REFERENCES orders(id) ON DELETE CASCADE,
  actor      text,
  action     text        NOT NULL,
  metadata   jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_order_id_idx ON audit_logs(order_id);

-- ---------------------------------------------------------------
-- 6. Operations tracking (ensure table exists)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operations_tracking (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid        REFERENCES orders(id) ON DELETE CASCADE,
  manual_minutes       integer     DEFAULT 0,
  manual_cost_twd      integer     DEFAULT 0,
  refund_amount_twd    integer     DEFAULT 0,
  subsidy_twd          integer     DEFAULT 0,
  is_rescheduled       boolean     DEFAULT false,
  has_complaint        boolean     DEFAULT false,
  has_guide_adjustment boolean     DEFAULT false,
  has_oversell_issue   boolean     DEFAULT false,
  note                 text,
  updated_at           timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS operations_tracking_order_id_idx ON operations_tracking(order_id);

-- ---------------------------------------------------------------
-- 7. KPI settings (ensure table exists)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_settings (
  id                          text PRIMARY KEY DEFAULT 'default',
  commission_rate             numeric(5,4) DEFAULT 0.15,
  payment_fee_rate            numeric(5,4) DEFAULT 0.035,
  guide_payout_rate           numeric(5,4) DEFAULT 0.65,
  healthy_min_contribution_twd integer      DEFAULT 1,
  healthy_allow_exception     boolean      DEFAULT false,
  updated_at                  timestamptz  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kpi_settings_history (
  version_id       text        PRIMARY KEY,
  actor            text,
  action           text,
  note             text,
  before_payload   jsonb,
  config_payload   jsonb,
  source_version_id text,
  created_at       timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------
-- 8. Guide applications (ensure table exists with correct schema)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guide_applications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text        NOT NULL,
  phone       text,
  email       text,
  city        text,
  bio         text,
  status      text        NOT NULL DEFAULT 'pending',
  admin_note  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guide_applications_status_idx ON guide_applications(status);
