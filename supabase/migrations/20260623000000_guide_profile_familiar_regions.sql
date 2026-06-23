-- 導遊申請 → 導遊公開檔案 進一步串接（熟悉區域／專業證照／收款方式）。
--
-- 背景：guide_applications 早已存 specialties/languages/regions/certifications，
-- 但 guide_profiles 只有「單一文字」region，且沒有 certifications／收款方式欄位 —
-- 上線建檔時這些資料帶不過去、導遊也無法在後台維護、旅客端公開頁看不到。
--
-- 本 migration：
--   1. guide_profiles 補上 regions / certifications / payment_methods（皆 jsonb 陣列），
--      讓「熟悉區域（複選）」「專業證照」「收款方式（複選）」可持久化並公開。
--      既有單一文字 region 欄位保留不動（向後相容；公開頁優先顯示 regions 陣列）。
--   2. guide_applications 補上 payment_methods（jsonb 陣列）：收款方式由單選改可複選，
--      原 payment_method(text) 欄位保留作為向後相容（存第一個選項）。
--
-- 回填：把現有 region(單一文字) 轉成 regions 陣列起點，避免既有導遊熟悉區域變空白。
-- 冪等：ADD COLUMN IF NOT EXISTS，可重複執行。
-- Rollback: 20260623000000_guide_profile_familiar_regions.rollback.sql

ALTER TABLE public.guide_profiles
  ADD COLUMN IF NOT EXISTS regions         jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS certifications  jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS payment_methods jsonb NOT NULL DEFAULT '[]';

-- 回填：單一文字 region 非空者，初始化 regions 為單元素陣列（僅在 regions 仍為空陣列時）。
UPDATE public.guide_profiles
  SET regions = jsonb_build_array(region)
  WHERE regions = '[]'::jsonb
    AND region IS NOT NULL
    AND btrim(region) <> '';

ALTER TABLE public.guide_applications
  ADD COLUMN IF NOT EXISTS payment_methods jsonb NOT NULL DEFAULT '[]';

-- 回填：單選 payment_method 非空者，初始化 payment_methods 為單元素陣列。
UPDATE public.guide_applications
  SET payment_methods = jsonb_build_array(payment_method)
  WHERE payment_methods = '[]'::jsonb
    AND payment_method IS NOT NULL
    AND btrim(payment_method) <> '';

COMMENT ON COLUMN public.guide_profiles.regions IS
  '導遊熟悉區域（文字陣列，複選）；上線時自動帶入自申請的 regions，導遊可於後台自行修改';
COMMENT ON COLUMN public.guide_profiles.certifications IS
  '導遊專業證照（文字陣列）；上線時自動帶入自申請的 certifications，導遊可於後台自行修改';
COMMENT ON COLUMN public.guide_profiles.payment_methods IS
  '導遊收款方式（文字陣列，複選，bank / linepay / transfer）；公開頁顯示可接受方式';
COMMENT ON COLUMN public.guide_applications.payment_methods IS
  '申請人偏好收款方式（文字陣列，複選）；上線時自動帶入 guide_profiles.payment_methods';
