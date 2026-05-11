-- Migration: 20260511_issue353_promo_codes
-- Issue #353: Promo codes backend — schema + Admin CRUD + validate API
-- Risk: HIGH — db-migration, supabase-rls, auth, billing
--
-- Adds:
--   1) promo_codes table (code UNIQUE UPPER-normalized, discount_type, discount_value,
--      max_uses, used_count, expires_at, active, per_user_limit, created_at)
--   2) promo_redemptions table (user_id, promo_code_id FK, order_id, redeemed_at)
--      UNIQUE(user_id, promo_code_id)
--   3) RLS enabled on both tables; service_role full access policy
--   4) fn_redeem_promo_code: atomic row-lock + increment + redemption record
--
-- Safety: idempotent DDL (CREATE TABLE IF NOT EXISTS);
--         RLS policies use DO $$ to guard duplicates.
-- Rollback: DROP TABLE IF EXISTS promo_redemptions CASCADE;
--           DROP TABLE IF EXISTS promo_codes CASCADE;
--           DROP FUNCTION IF EXISTS fn_redeem_promo_code;

BEGIN;

-- ============================================================
-- 1. Create promo_codes table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text         NOT NULL,
  discount_type  text         NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric(10,2) NOT NULL CHECK (discount_value > 0),
  max_uses       integer      NOT NULL DEFAULT 100,
  used_count     integer      NOT NULL DEFAULT 0,
  expires_at     timestamptz,
  active         boolean      NOT NULL DEFAULT true,
  per_user_limit integer      NOT NULL DEFAULT 1,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS promo_codes_code_idx ON public.promo_codes (code);
CREATE INDEX IF NOT EXISTS promo_codes_active_idx ON public.promo_codes (active);

-- ============================================================
-- 2. Create promo_redemptions table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid         NOT NULL,
  promo_code_id  uuid         NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  order_id       uuid,
  redeemed_at    timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (user_id, promo_code_id)
);

CREATE INDEX IF NOT EXISTS promo_redemptions_user_id_idx ON public.promo_redemptions (user_id);
CREATE INDEX IF NOT EXISTS promo_redemptions_promo_code_id_idx ON public.promo_redemptions (promo_code_id);

-- ============================================================
-- 3. Enable RLS
-- ============================================================

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS Policies
-- ============================================================

DO $$
BEGIN
  -- promo_codes: service role full access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'promo_codes' AND policyname = 'promo_codes: service role full access'
  ) THEN
    CREATE POLICY "promo_codes: service role full access"
      ON public.promo_codes
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- promo_redemptions: service role full access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'promo_redemptions' AND policyname = 'promo_redemptions: service role full access'
  ) THEN
    CREATE POLICY "promo_redemptions: service role full access"
      ON public.promo_redemptions
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ============================================================
-- 5. fn_redeem_promo_code: atomic row-lock + increment + redemption record
--    Returns jsonb: {ok, reason?, promo_code_id?, discount_type?, discount_value?}
-- ============================================================

CREATE OR REPLACE FUNCTION fn_redeem_promo_code(
  p_code     text,
  p_user_id  uuid,
  p_order_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_promo              public.promo_codes;
  v_user_redemptions   integer;
BEGIN
  -- Row-level lock to prevent concurrent double-redemption
  SELECT * INTO v_promo
    FROM public.promo_codes
    WHERE code = upper(trim(p_code))
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  END IF;

  IF NOT v_promo.active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'INACTIVE');
  END IF;

  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'EXPIRED');
  END IF;

  IF v_promo.used_count >= v_promo.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'EXHAUSTED');
  END IF;

  SELECT COUNT(*) INTO v_user_redemptions
    FROM public.promo_redemptions
    WHERE user_id = p_user_id AND promo_code_id = v_promo.id;

  IF v_user_redemptions >= v_promo.per_user_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ALREADY_REDEEMED');
  END IF;

  -- Atomic increment
  UPDATE public.promo_codes
    SET used_count = used_count + 1
    WHERE id = v_promo.id;

  -- Record redemption
  INSERT INTO public.promo_redemptions (user_id, promo_code_id, order_id)
    VALUES (p_user_id, v_promo.id, p_order_id);

  RETURN jsonb_build_object(
    'ok',            true,
    'promo_code_id', v_promo.id,
    'discount_type', v_promo.discount_type,
    'discount_value', v_promo.discount_value
  );
END $$;

COMMIT;
