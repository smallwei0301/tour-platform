-- 導遊自主發佈狀態：導遊在後台編輯公開頁、調整完成後才「公開」上架。
-- 預設 false（promote 上線即建檔但不公開）；認識導遊列表只顯示
-- is_published = true 的導遊。
--
-- 回填：現有 approved 導遊先前即公開可見，一律設為 true，避免本次
-- 變更把目前已在「認識導遊」的導遊全部隱藏。
--
-- Rollback: 20260611_guide_profiles_is_published.rollback.sql

ALTER TABLE public.guide_profiles
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

UPDATE public.guide_profiles
  SET is_published = true
  WHERE verification_status = 'approved';

COMMENT ON COLUMN public.guide_profiles.is_published IS '導遊自主發佈開關：true 才會出現在「認識導遊」公開列表';
