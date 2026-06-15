-- Rollback: 20260615_review_photos
-- 還原旅客評價照片上傳的 schema 變更。
-- 注意：bucket 內既有物件需另行清理；此處僅移除 policy / bucket / 欄位。

BEGIN;

DROP POLICY IF EXISTS "Public read review-photos" ON storage.objects;
DROP POLICY IF EXISTS "Service role insert review-photos" ON storage.objects;
DROP POLICY IF EXISTS "Service role delete review-photos" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'review-photos';

ALTER TABLE public.activity_reviews
  DROP COLUMN IF EXISTS photo_urls;

COMMIT;
