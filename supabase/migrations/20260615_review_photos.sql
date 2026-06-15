-- Migration: 20260615_review_photos
-- 旅客評價照片上傳：activity_reviews 新增 photo_urls，並建立 review-photos 公開儲存桶
-- Risk: LOW — 新增可空欄位（idempotent ADD COLUMN IF NOT EXISTS）+ 新 bucket（ON CONFLICT DO NOTHING）
-- Rollback: 20260615_review_photos.rollback.sql

BEGIN;

-- ============================================================
-- 1. activity_reviews 新增 photo_urls（jsonb 陣列，預設空）
-- ============================================================

ALTER TABLE public.activity_reviews
  ADD COLUMN IF NOT EXISTS photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================
-- 2. 建立 review-photos 公開儲存桶（旅客評價照片）
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'review-photos',
  'review-photos',
  true,
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS：公開讀取
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public read review-photos'
  ) THEN
    CREATE POLICY "Public read review-photos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'review-photos');
  END IF;

  -- 4. service role 上傳（API server 以 service-role key 上傳）
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Service role insert review-photos'
  ) THEN
    CREATE POLICY "Service role insert review-photos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'review-photos');
  END IF;

  -- 5. service role 刪除（清理被退審/移除的照片）
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Service role delete review-photos'
  ) THEN
    CREATE POLICY "Service role delete review-photos"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'review-photos');
  END IF;
END $$;

COMMIT;
