-- Align KPI guide payout defaults with settlement rules v1.
-- Settlement rules: platform commission 15%, guide payout 85%.
BEGIN;

ALTER TABLE IF EXISTS public.kpi_settings
  ALTER COLUMN guide_payout_rate SET DEFAULT 0.85;

UPDATE public.kpi_settings
SET guide_payout_rate = 0.85,
    updated_at = now()
WHERE id = 'default'
  AND (guide_payout_rate IS NULL OR guide_payout_rate = 0.65);

COMMIT;
