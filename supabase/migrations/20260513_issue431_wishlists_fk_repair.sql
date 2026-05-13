-- Issue #431: repair wishlists.activity_id FK to activities
-- Migration: 20260513_issue431_wishlists_fk_repair
-- Root cause: 20260512_issue405_wishlists_ensure.sql defined activity_id as
--   text NOT NULL — missing FK and wrong type. Correct schema is:
--   activity_id uuid REFERENCES public.activities(id) ON DELETE CASCADE
--
-- Fully idempotent: safe to re-run in any environment.

BEGIN;

-- ============================================================
-- 1. Guard: do nothing if wishlists table does not exist
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wishlists'
  ) THEN
    RAISE NOTICE 'public.wishlists does not exist — skipping #431 repair';
    RETURN;
  END IF;

  -- ============================================================
  -- 2. Cast activity_id from text → uuid if needed
  --    Validates that all existing rows have uuid-castable values
  --    that exist in public.activities before altering.
  -- ============================================================

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'wishlists'
      AND column_name  = 'activity_id'
      AND data_type    = 'text'
  ) THEN
    -- Repair known production drift before the uuid cast: some rows may contain
    -- activities.slug text instead of activities.id uuid text. Translate exact
    -- slug matches to the canonical activity uuid; keep unmatched text values as
    -- a hard stop so the cast never drops or invents data.
    IF EXISTS (
      SELECT 1
      FROM public.wishlists w
      WHERE w.activity_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND NOT EXISTS (
          SELECT 1 FROM public.activities a WHERE a.slug = btrim(w.activity_id)
        )
    ) THEN
      RAISE EXCEPTION 'wishlists.activity_id contains non-uuid values that do not match activities.slug; cannot repair safely';
    END IF;

    -- Guard against collisions that would violate UNIQUE(user_id, activity_id)
    -- after slug values are translated to their matching activity uuid.
    IF EXISTS (
      WITH normalized AS (
        SELECT
          w.id,
          w.user_id,
          COALESCE(a.id::text, w.activity_id) AS target_activity_id
        FROM public.wishlists w
        LEFT JOIN public.activities a
          ON w.activity_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND a.slug = btrim(w.activity_id)
      )
      SELECT 1
      FROM normalized
      GROUP BY user_id, target_activity_id
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'wishlists.activity_id slug repair would create duplicate (user_id, activity_id) rows; clean duplicates first';
    END IF;

    UPDATE public.wishlists w
    SET activity_id = a.id::text
    FROM public.activities a
    WHERE w.activity_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND a.slug = btrim(w.activity_id);

    -- Validate: every activity_id must now be a valid uuid
    IF EXISTS (
      SELECT 1 FROM public.wishlists
      WHERE activity_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) THEN
      RAISE EXCEPTION 'wishlists.activity_id contains non-uuid values; cannot cast to uuid safely';
    END IF;

    -- Validate: every activity_id value must exist in activities.id
    IF EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE NOT EXISTS (
        SELECT 1 FROM public.activities a WHERE a.id = w.activity_id::uuid
      )
    ) THEN
      RAISE EXCEPTION 'wishlists.activity_id contains values not present in activities.id; clean orphans first';
    END IF;

    -- Drop the unique constraint temporarily (it references activity_id type)
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.wishlists'::regclass
        AND conname = 'wishlists_user_activity_unique'
    ) THEN
      ALTER TABLE public.wishlists DROP CONSTRAINT wishlists_user_activity_unique;
    END IF;

    -- Perform the type cast
    ALTER TABLE public.wishlists
      ALTER COLUMN activity_id TYPE uuid USING activity_id::uuid;

    RAISE NOTICE 'wishlists.activity_id cast from text to uuid';

    -- Re-add the unique constraint
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.wishlists'::regclass
        AND conname = 'wishlists_user_activity_unique'
    ) THEN
      ALTER TABLE public.wishlists
        ADD CONSTRAINT wishlists_user_activity_unique UNIQUE (user_id, activity_id);
    END IF;
  END IF;

  -- ============================================================
  -- 3. Add FK constraint if not present
  --    Uses NOT VALID + VALIDATE pattern to avoid full table lock
  --    on large tables, then validates separately.
  -- ============================================================

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid  = 'public.wishlists'::regclass
      AND conname   = 'wishlists_activity_id_fkey'
      AND contype   = 'f'
  ) THEN
    ALTER TABLE public.wishlists
      ADD CONSTRAINT wishlists_activity_id_fkey
      FOREIGN KEY (activity_id)
      REFERENCES public.activities(id)
      ON DELETE CASCADE
      NOT VALID;

    ALTER TABLE public.wishlists
      VALIDATE CONSTRAINT wishlists_activity_id_fkey;

    RAISE NOTICE 'wishlists_activity_id_fkey FK constraint added and validated';
  ELSE
    RAISE NOTICE 'wishlists_activity_id_fkey already exists — skipping';
  END IF;

END $$;

-- ============================================================
-- 4. Reload PostgREST schema cache
-- ============================================================

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
