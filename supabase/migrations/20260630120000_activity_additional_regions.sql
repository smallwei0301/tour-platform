-- 行程「地點」支援複選（全台縣市）。
--
-- 背景（使用者需求）：行程編輯的地點選擇需要可選擇全台灣縣市，並可複選。
-- 既有資料模型每個行程只有單一 region/region_slug，決定詳情頁 URL
-- `/activities/[region]/[slug]`、canonical 與 SEO。為了不破壞單一 URL 結構，
-- 主要地區仍存在 region/region_slug；複選的其他縣市存進新的 `regions`（jsonb 陣列），
-- 讓行程在多個地區的篩選中都會出現。
--
-- 與 guide_profiles.regions（20260623000000）採同一形態：jsonb NOT NULL DEFAULT '[]'。
-- 冪等：ADD COLUMN IF NOT EXISTS，可重複執行。
-- Rollback: 20260630120000_activity_additional_regions.rollback.sql

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS regions jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.activities.regions IS
  '附加地區（複選，DB 規範值如「高雄市」）。主要地區仍存於 region/region_slug 決定 URL/SEO；本欄讓行程在多個地區篩選中出現。';

-- 回填：主要 region 非空者，初始化 regions 至少含主要地區（僅在 regions 仍為空陣列時），
-- 讓既有資料在「以主要地區做 jsonb 包含篩選」時也命中。
UPDATE public.activities
  SET regions = jsonb_build_array(region)
  WHERE regions = '[]'::jsonb
    AND region IS NOT NULL
    AND btrim(region) <> '';

-- jsonb 包含查詢（regions @> '["高雄市"]'）走 GIN index。
CREATE INDEX IF NOT EXISTS activities_regions_gin_idx
  ON public.activities USING gin (regions jsonb_path_ops);
