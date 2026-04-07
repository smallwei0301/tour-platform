-- Migration 011: Storage RLS — public read for activity images
-- Phase 9 | 2026-04-07
-- 修復 tech debt TD-01

CREATE POLICY "Public read access for activity images"
ON storage.objects FOR SELECT
USING (bucket_id = 'activity-images');
