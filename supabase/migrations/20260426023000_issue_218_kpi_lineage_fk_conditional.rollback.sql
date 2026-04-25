-- Issue #218 rollback
-- Safe no-op when FK was never added (e.g., orphan_count > 0 branch).

ALTER TABLE IF EXISTS public.kpi_settings_history
  DROP CONSTRAINT IF EXISTS fk_kpi_settings_history_source_version_id;

COMMENT ON COLUMN public.events.session_id IS
  'Client-generated anonymous session UUID (analytics token; non-FK by design).';
