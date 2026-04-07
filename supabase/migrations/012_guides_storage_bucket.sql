-- Migration 012: Create guides storage bucket for avatar images
-- Phase 11 Task #1 | 2026-04-07
-- 導遊頭像存儲桶

-- 1. Create guides bucket (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'guides',
  'guides',
  true,
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS Policy: Public read access
CREATE POLICY "Public read guides"
ON storage.objects FOR SELECT
USING (bucket_id = 'guides');

-- 3. RLS Policy: Service role can insert (API server uploads)
CREATE POLICY "Service role insert guides"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'guides');

-- 4. RLS Policy: Service role can update
CREATE POLICY "Service role update guides"
ON storage.objects FOR UPDATE
USING (bucket_id = 'guides');

-- 5. RLS Policy: Service role can delete
CREATE POLICY "Service role delete guides"
ON storage.objects FOR DELETE
USING (bucket_id = 'guides');
