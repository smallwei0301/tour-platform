-- 導遊申請照片欄位：申請時即收個人照片（必填）、個人封面與活動照片（選填）。
-- 上線（promote）時自動帶入 guide_profiles 的
-- profile_photo_url / hero_image_url / gallery_urls，
-- 導遊首次登入後台即有完整照片，認識導遊頁立即可見。
--
-- Rollback: 20260611_guide_application_photos.rollback.sql

ALTER TABLE public.guide_applications
  ADD COLUMN IF NOT EXISTS profile_photo_url text,
  ADD COLUMN IF NOT EXISTS hero_image_url    text,
  ADD COLUMN IF NOT EXISTS gallery_urls      jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.guide_applications.profile_photo_url IS '申請者個人照片（公開 URL，必填於表單層）';
COMMENT ON COLUMN public.guide_applications.hero_image_url    IS '申請者個人封面（公開 URL，選填）';
COMMENT ON COLUMN public.guide_applications.gallery_urls      IS '申請者活動照片 URL 陣列（選填，最多 12）';
