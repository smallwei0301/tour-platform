-- Migration: 20260611120000_issue1411_order_messages
-- Issue #1411: 站內訊息第一期 — 訂單留言串（traveler ↔ guide，admin 唯讀）
-- Risk: MEDIUM — db-migration, supabase-rls（新表，不動既有表）
--
-- Creates:
--   1) order_messages：訂單層級留言（append-only，純文字 ≤1000 字）
--   2) RLS enabled + 2 policies（idempotent DO $$ guards）:
--        - traveler_read_own_order_messages: 旅客可讀自己訂單（user_id = auth.uid()）的留言
--        - service_role_all_order_messages: service role 全存取
--          （INSERT 與 guide/admin 讀取一律走 service-role API route，
--           ownership／發言窗口由 route + db.mjs gateway 把關 — guide 非 Supabase auth user）
--   3) Index on (order_id, created_at) — 留言串依時間讀取
--
-- Safety: idempotent CREATE TABLE IF NOT EXISTS; RLS policies use DO $$ IF NOT EXISTS guard.
-- Rollback: DROP TABLE IF EXISTS order_messages CASCADE（見文末註解）

BEGIN;

-- ============================================================
-- 1. Create order_messages table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_role text        NOT NULL CHECK (sender_role IN ('traveler', 'guide', 'admin')),
  sender_id   text,
  body        text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Enable Row Level Security
-- ============================================================

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Index for thread reads
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_order_messages_order_created
  ON public.order_messages(order_id, created_at);

-- ============================================================
-- 4. RLS policies (idempotent DO $$ guards)
-- ============================================================

DO $$
BEGIN
  -- Policy 1: 旅客可讀自己訂單的留言（anon client SSR 讀取路徑）
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_messages'
      AND policyname = 'traveler_read_own_order_messages'
  ) THEN
    CREATE POLICY "traveler_read_own_order_messages" ON public.order_messages
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = order_messages.order_id
            AND o.user_id = auth.uid()
        )
      );
  END IF;

  -- Policy 2: service role 全存取（guide/admin 讀寫與 traveler 寫入都走 service-role route）
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_messages'
      AND policyname = 'service_role_all_order_messages'
  ) THEN
    CREATE POLICY "service_role_all_order_messages" ON public.order_messages
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- ============================================================
-- Rollback (run manually to undo this migration)
-- ============================================================
-- DROP TABLE IF EXISTS public.order_messages CASCADE;
