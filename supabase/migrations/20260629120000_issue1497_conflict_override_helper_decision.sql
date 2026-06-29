-- #1497 — 導遊幫手確認：記錄導遊對 conflict override 的幫手表態時間。
-- Rollback: ALTER TABLE public.guide_slot_conflict_overrides DROP COLUMN IF EXISTS helper_decided_at;

BEGIN;

ALTER TABLE public.guide_slot_conflict_overrides
  ADD COLUMN IF NOT EXISTS helper_decided_at timestamptz;

COMMENT ON COLUMN public.guide_slot_conflict_overrides.helper_decided_at IS
  'When the guide confirmed/declined the helper for this override (#1497).';

COMMIT;
