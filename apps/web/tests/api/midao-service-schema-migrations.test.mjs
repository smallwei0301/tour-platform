import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Static SQL contract assertions for the S1 service schema migrations
// (#1758 Task 22). These do NOT run a live DB; they assert that the forward
// migrations declare the expected tables, columns, CHECK/UNIQUE constraints,
// RLS enablement, and least-privilege grants, mirroring the audit-pattern used
// by midao-service-role-acl-hardening-migration.test.mjs.

const draftsMigrationUrl = new URL(
  '../../../../supabase/migrations/20260723020000_midao_service_drafts_and_questions.sql',
  import.meta.url,
);
const draftsRollbackUrl = new URL(
  '../../../../supabase/migrations/20260723020000_midao_service_drafts_and_questions.rollback.sql',
  import.meta.url,
);
const publicationMigrationUrl = new URL(
  '../../../../supabase/migrations/20260723021000_midao_service_publication_versions.sql',
  import.meta.url,
);
const publicationRollbackUrl = new URL(
  '../../../../supabase/migrations/20260723021000_midao_service_publication_versions.rollback.sql',
  import.meta.url,
);

async function readNormalized(url) {
  const raw = await readFile(url, 'utf8');
  return raw.replace(/\s+/gu, ' ');
}

test('drafts+questions migration declares guide_service_drafts with revision and single-active-draft guard', async () => {
  const sql = await readNormalized(draftsMigrationUrl);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.guide_service_drafts/u);
  // revision column drives later CAS/409 conflict detection.
  assert.match(sql, /revision INTEGER NOT NULL DEFAULT 1/u);
  assert.match(sql, /CHECK \(revision >= 1\)/u);
  // FK to activities + guide_profiles.
  assert.match(sql, /activity_id UUID NOT NULL[^,]*REFERENCES public\.activities \(id\)/u);
  assert.match(sql, /guide_id UUID NOT NULL[^,]*REFERENCES public\.guide_profiles \(id\)/u);
  // status enum guard.
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'active'/u);
  assert.match(sql, /CHECK \(status IN \('active', 'discarded', 'published'\)\)/u);
  // partial unique index: at most one active draft per activity.
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS midao_guide_service_drafts_single_active_idx ON public\.guide_service_drafts \(activity_id\) WHERE status = 'active'/u,
  );
  // RLS enabled + forced.
  assert.match(sql, /ALTER TABLE public\.guide_service_drafts ENABLE ROW LEVEL SECURITY/u);
  assert.match(sql, /ALTER TABLE public\.guide_service_drafts FORCE ROW LEVEL SECURITY/u);
  // least-privilege grants: never open writes to PUBLIC/anon.
  assert.match(sql, /REVOKE ALL ON TABLE public\.guide_service_drafts FROM PUBLIC, anon, authenticated/u);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.guide_service_drafts TO service_role/u);
});

test('drafts+questions migration declares activity_intake_questions with type/options constraints', async () => {
  const sql = await readNormalized(draftsMigrationUrl);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.activity_intake_questions/u);
  assert.match(sql, /activity_id UUID NOT NULL[^,]*REFERENCES public\.activities \(id\)/u);
  assert.match(sql, /question_key TEXT NOT NULL/u);
  // type CHECK allowlist.
  assert.match(
    sql,
    /CHECK \(type IN \('single_choice', 'multi_choice', 'short_text', 'long_text'\)\)/u,
  );
  // options / required / sort_order columns + defaults.
  assert.match(sql, /options JSONB NOT NULL DEFAULT '\[\]'::jsonb/u);
  assert.match(sql, /required BOOLEAN NOT NULL DEFAULT false/u);
  assert.match(sql, /sort_order INTEGER NOT NULL DEFAULT 0/u);
  // choice types require options; text types must have none.
  assert.match(sql, /midao_activity_intake_questions_options_shape_check/u);
  // uniqueness of question_key within an activity.
  assert.match(sql, /UNIQUE \(activity_id, question_key\)/u);
  // RLS + least-privilege grants.
  assert.match(sql, /ALTER TABLE public\.activity_intake_questions ENABLE ROW LEVEL SECURITY/u);
  assert.match(sql, /ALTER TABLE public\.activity_intake_questions FORCE ROW LEVEL SECURITY/u);
  assert.match(sql, /REVOKE ALL ON TABLE public\.activity_intake_questions FROM PUBLIC, anon, authenticated/u);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.activity_intake_questions TO service_role/u);
});

test('drafts+questions migration adds activities.inquiry_enabled boolean default false', async () => {
  const sql = await readNormalized(draftsMigrationUrl);
  assert.match(
    sql,
    /ALTER TABLE public\.activities ADD COLUMN IF NOT EXISTS inquiry_enabled BOOLEAN NOT NULL DEFAULT false/u,
  );
});

test('publication versions migration declares immutable snapshot table with unique version', async () => {
  const sql = await readNormalized(publicationMigrationUrl);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.service_publication_versions/u);
  assert.match(sql, /activity_id UUID NOT NULL[^,]*REFERENCES public\.activities \(id\)/u);
  assert.match(sql, /version INTEGER NOT NULL/u);
  assert.match(sql, /CHECK \(version >= 1\)/u);
  assert.match(sql, /snapshot JSONB NOT NULL/u);
  // one row per (activity, version).
  assert.match(sql, /UNIQUE \(activity_id, version\)/u);
  // RLS + immutable least-privilege grants (SELECT/INSERT only — no UPDATE/DELETE).
  assert.match(sql, /ALTER TABLE public\.service_publication_versions ENABLE ROW LEVEL SECURITY/u);
  assert.match(sql, /ALTER TABLE public\.service_publication_versions FORCE ROW LEVEL SECURITY/u);
  assert.match(sql, /REVOKE ALL ON TABLE public\.service_publication_versions FROM PUBLIC, anon, authenticated/u);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE public\.service_publication_versions TO service_role/u);
  // must NOT grant UPDATE or DELETE (immutability).
  assert.doesNotMatch(sql, /GRANT[^;]*UPDATE[^;]*service_publication_versions/u);
  assert.doesNotMatch(sql, /GRANT[^;]*DELETE[^;]*service_publication_versions/u);
});

test('rollback companions are operator-only and block auto-run', async () => {
  for (const url of [draftsRollbackUrl, publicationRollbackUrl]) {
    const raw = await readFile(url, 'utf8');
    assert.match(raw, /OPERATOR-ONLY ROLLBACK COMPANION/u);
    assert.match(raw, /NEVER auto-run/u);
    assert.match(raw, /RAISE EXCEPTION/u);
    assert.match(raw, /MIDAO_HISTORICAL_ROLLBACK_BLOCKED/u);
  }
});
