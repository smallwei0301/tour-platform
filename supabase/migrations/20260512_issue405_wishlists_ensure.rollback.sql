-- Rollback for 20260512_issue405_wishlists_ensure.sql
-- WARNING: This will destroy all wishlist data. Use only in dev/staging.
DROP TABLE IF EXISTS public.wishlists CASCADE;
