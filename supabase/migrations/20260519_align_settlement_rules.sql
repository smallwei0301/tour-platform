-- Align KPI settlement defaults with settlement rules v1.
-- Settlement rules: platform commission 15%, guide payout 85%.
BEGIN;

ALTER TABLE IF EXISTS public.kpi_settings
  ALTER COLUMN commission_rate SET DEFAULT 0.15,
  ALTER COLUMN guide_payout_rate SET DEFAULT 0.85;

UPDATE public.kpi_settings
SET commission_rate = 0.15,
    guide_payout_rate = 0.85,
    updated_at = now()
WHERE id = 'default'
  AND (
    commission_rate IS NULL
    OR commission_rate <> 0.15
    OR guide_payout_rate IS NULL
    OR guide_payout_rate <> 0.85
  );

COMMIT;
