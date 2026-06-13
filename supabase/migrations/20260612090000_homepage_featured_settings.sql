-- 首頁精選設定：admin 可選「編輯精選」與「更多精選行程」，首頁依此渲染。
-- Singleton row（id='default'），模式比照 kpi_settings / soft_launch_controls。
-- Rollback: DROP TABLE IF EXISTS homepage_featured_settings;

CREATE TABLE IF NOT EXISTS homepage_featured_settings (
  id text PRIMARY KEY DEFAULT 'default',
  editor_pick_slug text,
  more_featured_slugs jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

INSERT INTO homepage_featured_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;

ALTER TABLE homepage_featured_settings ENABLE ROW LEVEL SECURITY;

-- service-role 全權（admin API / 首頁 server component 皆走 service client）
DROP POLICY IF EXISTS "homepage_featured_settings: service_role full" ON homepage_featured_settings;
CREATE POLICY "homepage_featured_settings: service_role full" ON homepage_featured_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 已登入使用者唯讀（與 soft_launch_controls 同策略）
DROP POLICY IF EXISTS "homepage_featured_settings: authenticated read" ON homepage_featured_settings;
CREATE POLICY "homepage_featured_settings: authenticated read" ON homepage_featured_settings
  FOR SELECT TO authenticated USING (true);
