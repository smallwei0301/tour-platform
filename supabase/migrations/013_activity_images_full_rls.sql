-- Migration 013: Complete RLS policies for activity-images bucket
-- Phase 11 Task #1 | 2026-04-07
-- 補全 activity-images bucket 的 RLS 策略（上傳、更新、刪除）

-- Note: 011_storage_rls.sql already created SELECT policy

-- 1. RLS Policy: Service role can insert (API server uploads)
CREATE POLICY "Service role insert activity-images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'activity-images');

-- 2. RLS Policy: Service role can update
CREATE POLICY "Service role update activity-images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'activity-images');

-- 3. RLS Policy: Service role can delete
CREATE POLICY "Service role delete activity-images"
ON storage.objects FOR DELETE
USING (bucket_id = 'activity-images');

-- 4. Update bucket settings (file size limit and allowed types)
UPDATE storage.buckets
SET
  file_size_limit = 10485760,  -- 10MB limit (Hero images can be larger)
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'activity-images';
