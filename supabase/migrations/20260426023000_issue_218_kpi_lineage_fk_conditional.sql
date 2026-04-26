-- Issue #218
-- Conditional FK hardening for KPI lineage:
--   kpi_settings_history.source_version_id -> kpi_settings_history.version_id
-- Rule:
--   - Enforce only when orphan precheck is zero.
--   - Otherwise skip enforcement and keep evidence in migration NOTICE output.
-- Also clarifies events.session_id as intentional non-FK analytics token.

DO $$
DECLARE
  v_orphan_count bigint;
  v_fk_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'kpi_settings_history'
      AND c.conname = 'fk_kpi_settings_history_source_version_id'
  ) INTO v_fk_exists;

  SELECT COUNT(*)
  INTO v_orphan_count
  FROM public.kpi_settings_history h
  LEFT JOIN public.kpi_settings_history p
    ON h.source_version_id = p.version_id
  WHERE h.source_version_id IS NOT NULL
    AND btrim(h.source_version_id) <> ''
    AND p.version_id IS NULL;

  IF v_fk_exists THEN
    RAISE NOTICE '[issue-218] FK already exists: fk_kpi_settings_history_source_version_id';
  ELSIF v_orphan_count = 0 THEN
    ALTER TABLE public.kpi_settings_history
      ADD CONSTRAINT fk_kpi_settings_history_source_version_id
      FOREIGN KEY (source_version_id)
      REFERENCES public.kpi_settings_history(version_id)
      ON DELETE SET NULL;

    RAISE NOTICE '[issue-218] FK added: fk_kpi_settings_history_source_version_id';
  ELSE
    RAISE NOTICE '[issue-218] FK skipped due to orphan_count=% on kpi_settings_history.source_version_id', v_orphan_count;
  END IF;
END $$;

COMMENT ON COLUMN public.events.session_id IS
  'Analytics session token (client-generated, nullable, high-cardinality). Intentionally non-FK unless a dedicated sessions table is introduced.';
