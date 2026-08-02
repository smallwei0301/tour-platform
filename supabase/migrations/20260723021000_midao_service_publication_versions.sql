-- #1758 S1 · Task 22 — service publication versions (immutable publish snapshots).
-- Forward-only, additive migration. Records an immutable snapshot per publish so
-- later publish/restore flows can reference a canonical version. Does NOT touch
-- frozen orders/payments or existing Package 2 migrations.

CREATE TABLE IF NOT EXISTS public.service_publication_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL
    REFERENCES public.activities (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  published_by UUID
    REFERENCES public.guide_profiles (id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT midao_service_publication_versions_version_check
    CHECK (version >= 1),
  CONSTRAINT midao_service_publication_versions_activity_version_unique
    UNIQUE (activity_id, version)
);

CREATE INDEX IF NOT EXISTS midao_service_publication_versions_activity_idx
  ON public.service_publication_versions (activity_id, version, id);

ALTER TABLE public.service_publication_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_publication_versions FORCE ROW LEVEL SECURITY;

-- Immutable snapshot table: SELECT/INSERT only — no UPDATE/DELETE granted so a
-- published version can never be silently mutated or destroyed.
REVOKE ALL ON TABLE public.service_publication_versions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.service_publication_versions
  TO service_role;

COMMENT ON TABLE public.service_publication_versions IS
  'Append-only, immutable per-publish snapshot of an activity service definition; one row per (activity_id, version).';
COMMENT ON COLUMN public.service_publication_versions.snapshot IS
  'Immutable published service snapshot; must not contain tokens, cookies, payment secrets, or unnecessary traveler PII.';
