-- Migration 010: Add user_id to orders table
-- Phase 9 | 2026-04-07
-- 目的：旅客 OAuth 登入後，訂單可綁定 Supabase Auth user

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders(user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN orders.user_id IS 'Supabase Auth user ID. NULL for orders created before Phase 9 (use contactEmail fallback).';
