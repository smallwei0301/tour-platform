-- =============================================================
-- 001_mvp_core_v2.sql
-- Tour Platform MVP — Core Tables (Best Practices Applied)
-- Based on: supabase/agent-skills postgres-best-practices
-- =============================================================
-- Best practices applied:
--   [query-missing-indexes] Index all FK + WHERE columns
--   [schema-partial-indexes] Partial indexes for status columns
--   [security-rls] Enable RLS on all tables + policies
--   [schema-timestamptz] All timestamps are timestamptz
--   gen_random_uuid() for all UUIDs
-- =============================================================

-- Extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------
-- users
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  role       text        NOT NULL CHECK (role IN ('traveler', 'guide', 'admin')),
  email      text        UNIQUE,
  name       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users: service role full access" ON users
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- guide_profiles
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guide_profiles (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        REFERENCES users(id) ON DELETE CASCADE,
  slug                    text        UNIQUE NOT NULL,
  display_name            text        NOT NULL,
  headline                text,
  bio                     text,
  region                  text,
  languages               jsonb       NOT NULL DEFAULT '[]',
  specialties             jsonb       NOT NULL DEFAULT '[]',
  profile_photo_url       text,
  hero_image_url          text,
  gallery_urls            jsonb       NOT NULL DEFAULT '[]',
  verification_status     text        NOT NULL DEFAULT 'pending'
                            CHECK (verification_status IN ('pending','approved','rejected','suspended')),
  id_verified             boolean     NOT NULL DEFAULT false,
  guide_license_verified  boolean     NOT NULL DEFAULT false,
  rating_avg              numeric(3,2),
  review_count            integer     NOT NULL DEFAULT 0,
  service_count           integer     NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- [query-missing-indexes] Index FK + filter columns
CREATE INDEX IF NOT EXISTS guide_profiles_user_id_idx ON guide_profiles(user_id);
CREATE INDEX IF NOT EXISTS guide_profiles_region_idx  ON guide_profiles(region);
-- [schema-partial-indexes] Partial index for approved guides only (most common query)
CREATE INDEX IF NOT EXISTS guide_profiles_approved_idx ON guide_profiles(slug)
  WHERE verification_status = 'approved';

ALTER TABLE guide_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guide_profiles: public read approved" ON guide_profiles
  FOR SELECT USING (verification_status = 'approved');
CREATE POLICY "guide_profiles: service role full access" ON guide_profiles
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id              uuid        REFERENCES guide_profiles(id) ON DELETE SET NULL,
  guide_slug            text,
  title                 text        NOT NULL,
  slug                  text        UNIQUE NOT NULL,
  tagline               text,
  short_description     text,
  description           text,
  region                text,
  region_slug           text,
  category              text,
  price_twd             integer     NOT NULL DEFAULT 0,
  min_participants      integer     NOT NULL DEFAULT 1,
  max_participants      integer     NOT NULL DEFAULT 10,
  duration_minutes      integer,
  meeting_point         text,
  meeting_point_map_url text,
  cover_image_url       text,
  image_urls            jsonb       NOT NULL DEFAULT '[]',
  inclusions            jsonb       NOT NULL DEFAULT '[]',
  exclusions            jsonb       NOT NULL DEFAULT '[]',
  notices               jsonb       NOT NULL DEFAULT '[]',
  refund_policy_type    text        NOT NULL DEFAULT 'standard',
  refund_rules          jsonb       NOT NULL DEFAULT '[]',
  safety_notice         text,
  faq                   jsonb       NOT NULL DEFAULT '[]',
  good_for              jsonb       NOT NULL DEFAULT '[]',
  not_good_for          jsonb       NOT NULL DEFAULT '[]',
  transport_mode        text,
  seo_title             text,
  seo_description       text,
  status                text        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','published','archived')),
  published_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- [query-missing-indexes] FK index
CREATE INDEX IF NOT EXISTS activities_guide_id_idx   ON activities(guide_id);
CREATE INDEX IF NOT EXISTS activities_guide_slug_idx ON activities(guide_slug);
CREATE INDEX IF NOT EXISTS activities_region_idx     ON activities(region);
CREATE INDEX IF NOT EXISTS activities_category_idx   ON activities(category);
-- [schema-partial-indexes] Most queries only touch published activities
CREATE INDEX IF NOT EXISTS activities_published_idx  ON activities(region, category, published_at DESC)
  WHERE status = 'published';

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities: public read published" ON activities
  FOR SELECT USING (status = 'published');
CREATE POLICY "activities: service role full access" ON activities
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- activity_schedules
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_schedules (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id  uuid        NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  start_at     timestamptz NOT NULL,
  end_at       timestamptz NOT NULL,
  capacity     integer     NOT NULL DEFAULT 10,
  booked_count integer     NOT NULL DEFAULT 0,
  status       text        NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','full','cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- [query-missing-indexes] FK + time range queries
CREATE INDEX IF NOT EXISTS activity_schedules_activity_id_idx ON activity_schedules(activity_id);
CREATE INDEX IF NOT EXISTS activity_schedules_start_at_idx    ON activity_schedules(start_at);
-- [schema-partial-indexes] Only open schedules matter for booking
CREATE INDEX IF NOT EXISTS activity_schedules_open_idx ON activity_schedules(activity_id, start_at)
  WHERE status = 'open';

ALTER TABLE activity_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_schedules: public read" ON activity_schedules
  FOR SELECT USING (true);
CREATE POLICY "activity_schedules: service role full access" ON activity_schedules
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id    uuid        REFERENCES activities(id) ON DELETE SET NULL,
  schedule_id    uuid        REFERENCES activity_schedules(id) ON DELETE SET NULL,
  status         text        NOT NULL DEFAULT 'pending_payment',
  people_count   integer     NOT NULL DEFAULT 1,
  total_twd      integer     NOT NULL DEFAULT 0,
  contact_name   text,
  contact_phone  text,
  contact_email  text,
  admin_note     text,
  paid_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- [query-missing-indexes] FK + status filter
CREATE INDEX IF NOT EXISTS orders_activity_id_idx  ON orders(activity_id);
CREATE INDEX IF NOT EXISTS orders_schedule_id_idx  ON orders(schedule_id);
CREATE INDEX IF NOT EXISTS orders_contact_email_idx ON orders(contact_email);
CREATE INDEX IF NOT EXISTS orders_created_at_idx   ON orders(created_at DESC);
-- [schema-partial-indexes] Active orders subset
CREATE INDEX IF NOT EXISTS orders_active_idx ON orders(created_at DESC)
  WHERE status IN ('pending_payment','paid','confirmed','refund_pending');

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders: service role full access" ON orders
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        REFERENCES orders(id) ON DELETE CASCADE,
  provider    text        NOT NULL DEFAULT 'ecpay',
  trade_no    text,
  amount_twd  integer     NOT NULL DEFAULT 0,
  status      text        NOT NULL DEFAULT 'created',
  paid_at     timestamptz,
  raw_payload jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_order_id_idx ON payments(order_id);
-- [schema-partial-indexes] Paid payments for reconciliation
CREATE INDEX IF NOT EXISTS payments_paid_idx ON payments(paid_at DESC)
  WHERE status = 'paid';

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments: service role full access" ON payments
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- refund_requests
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refund_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid        REFERENCES orders(id) ON DELETE CASCADE,
  reason       text        NOT NULL DEFAULT 'user_request',
  note         text,
  status       text        NOT NULL DEFAULT 'requested',
  admin_note   text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at  timestamptz,
  refunded_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refund_requests_order_id_idx ON refund_requests(order_id);
-- [schema-partial-indexes] Active refunds only
CREATE INDEX IF NOT EXISTS refund_requests_active_idx ON refund_requests(requested_at DESC)
  WHERE status IN ('requested','reviewing','approved','processing');

ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refund_requests: service role full access" ON refund_requests
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- guide_applications
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guide_applications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  text        NOT NULL,
  phone      text,
  email      text,
  city       text,
  bio        text,
  status     text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected','suspended')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- [schema-partial-indexes] Pending applications are the main admin task
CREATE INDEX IF NOT EXISTS guide_applications_pending_idx ON guide_applications(created_at DESC)
  WHERE status = 'pending';

ALTER TABLE guide_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guide_applications: service role full access" ON guide_applications
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id         bigserial   PRIMARY KEY,
  order_id   uuid        REFERENCES orders(id) ON DELETE CASCADE,
  actor      text,
  action     text        NOT NULL,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_order_id_idx  ON audit_logs(order_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs: service role full access" ON audit_logs
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- operations_tracking
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operations_tracking (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid        UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  manual_minutes       integer     NOT NULL DEFAULT 0,
  manual_cost_twd      integer     NOT NULL DEFAULT 0,
  refund_amount_twd    integer     NOT NULL DEFAULT 0,
  subsidy_twd          integer     NOT NULL DEFAULT 0,
  is_rescheduled       boolean     NOT NULL DEFAULT false,
  has_complaint        boolean     NOT NULL DEFAULT false,
  has_guide_adjustment boolean     NOT NULL DEFAULT false,
  has_oversell_issue   boolean     NOT NULL DEFAULT false,
  note                 text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE operations_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operations_tracking: service role full access" ON operations_tracking
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- kpi_settings
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_settings (
  id                            text        PRIMARY KEY DEFAULT 'default',
  commission_rate               numeric(5,4) NOT NULL DEFAULT 0.15,
  payment_fee_rate              numeric(5,4) NOT NULL DEFAULT 0.035,
  guide_payout_rate             numeric(5,4) NOT NULL DEFAULT 0.65,
  healthy_min_contribution_twd  integer      NOT NULL DEFAULT 1,
  healthy_allow_exception       boolean      NOT NULL DEFAULT false,
  updated_at                    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE kpi_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_settings: service role full access" ON kpi_settings
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS kpi_settings_history (
  version_id        text        PRIMARY KEY,
  actor             text,
  action            text,
  note              text,
  before_payload    jsonb,
  config_payload    jsonb,
  source_version_id text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kpi_settings_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_settings_history: service role full access" ON kpi_settings_history
  USING (true) WITH CHECK (true);
