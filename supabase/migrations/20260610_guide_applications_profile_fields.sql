-- 導遊申請 → 導遊檔案 資料串接：申請表單早已收集專長/語言/服務地區/
-- 證照/收款方式，但 guide_applications 沒有欄位可存，後端一路丟掉，
-- admin 審核時看不到、上線建檔也帶不過去。本 migration 補上持久化欄位。
--
-- 冪等：ADD COLUMN IF NOT EXISTS，可重複執行。

ALTER TABLE public.guide_applications
  ADD COLUMN IF NOT EXISTS specialties    jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS languages      jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS regions        jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS certifications jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS payment_method text;

COMMENT ON COLUMN public.guide_applications.specialties IS
  '申請人專長領域（文字陣列）；上線時自動帶入 guide_profiles.specialties';
COMMENT ON COLUMN public.guide_applications.languages IS
  '申請人可用語言（文字陣列）；上線時自動帶入 guide_profiles.languages';
COMMENT ON COLUMN public.guide_applications.regions IS
  '申請人可服務地區（文字陣列）';
COMMENT ON COLUMN public.guide_applications.certifications IS
  '申請人自述證照清單（文字陣列）；僅供審核參考，不自動標記 guide_license_verified';
COMMENT ON COLUMN public.guide_applications.payment_method IS
  '申請人偏好收款方式（bank / linepay / transfer）';
