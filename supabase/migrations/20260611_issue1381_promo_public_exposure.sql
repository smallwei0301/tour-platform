-- Issue #1381 — Promo code 旅客端曝光
-- promo_codes 增加公開曝光屬性：is_public（admin 控制是否對旅客顯示）
-- 與 public_label（旅客端顯示文案，空值時前端以折扣內容組預設文案）。
-- Safety: idempotent DDL。

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS public_label text;

-- 旅客端公開清單查詢路徑：is_public AND active
CREATE INDEX IF NOT EXISTS promo_codes_public_active_idx
  ON public.promo_codes (is_public, active)
  WHERE is_public = true;
