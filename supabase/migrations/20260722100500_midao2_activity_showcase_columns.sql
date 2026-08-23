-- 20260722100500_midao2_activity_showcase_columns.sql
-- midao2 雙軌可見度＋精靈欄位（spec §4.1/§4.5）。只增不改。
ALTER TABLE activities ADD COLUMN IF NOT EXISTS midao_status text
  CHECK (midao_status IN ('draft','published'));
ALTER TABLE activities ADD COLUMN IF NOT EXISTS midao_deal_mode text NOT NULL DEFAULT 'confirm_first'
  CHECK (midao_deal_mode IN ('instant_booking','confirm_first','line_inquiry'));
ALTER TABLE activities ADD COLUMN IF NOT EXISTS midao_questions jsonb NOT NULL DEFAULT '[]';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS languages jsonb NOT NULL DEFAULT '[]';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS midao_sort_order integer;

ALTER TABLE guide_profiles ADD COLUMN IF NOT EXISTS experience_years integer;
