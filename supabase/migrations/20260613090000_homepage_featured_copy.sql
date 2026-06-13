-- 首頁精選文案覆寫：admin 可選真實行程並手動編輯首頁卡片文案。
-- editor_pick_copy：編輯精選大卡覆寫值 { title, subtitle, desc, tagLabel, difficulty, imageUrl, ratingScore, ratingCount }
-- more_featured_copy：更多精選覆寫值，key=slug → { title, tagline, imageUrl }
-- 留空欄位＝首頁回退「自動帶入」（從真實行程資料衍生）。
-- Rollback:
--   ALTER TABLE homepage_featured_settings DROP COLUMN IF EXISTS editor_pick_copy;
--   ALTER TABLE homepage_featured_settings DROP COLUMN IF EXISTS more_featured_copy;

ALTER TABLE homepage_featured_settings
  ADD COLUMN IF NOT EXISTS editor_pick_copy jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE homepage_featured_settings
  ADD COLUMN IF NOT EXISTS more_featured_copy jsonb NOT NULL DEFAULT '{}'::jsonb;
