import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const repoFile = (relativePath) => join(REPO_ROOT, relativePath);
const MIGRATION = repoFile('supabase/migrations/20260723004000_midao_request_read_projection.sql');

test('Task14 migration creates a service-role-only server-side booking request projection', () => {
  assert.equal(existsSync(MIGRATION), true, `missing Task14 migration: ${MIGRATION}`);
  const sql = readFileSync(MIGRATION, 'utf8');

  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_order_messages_order_latest\s+ON public\.order_messages\s*\(order_id, created_at DESC, id DESC\)/iu);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.midao_list_booking_requests\s*\(\s*p_guide_id uuid,/iu);
  assert.match(sql, /RETURNS TABLE\s*\([\s\S]*booking_id uuid[\s\S]*order_id uuid[\s\S]*bucket text[\s\S]*priority_rank integer/iu);
  assert.match(sql, /LANGUAGE plpgsql\s+STABLE\s+SECURITY INVOKER\s+SET search_path = pg_catalog, public/iu);
  assert.doesNotMatch(sql, /SECURITY DEFINER/iu);

  assert.match(sql, /JOIN public\.orders o\s+ON o\.booking_id = b\.id\s+AND o\.id = b\.order_id/iu);
  assert.match(sql, /LEFT JOIN public\.orders canonical_order\s+ON canonical_order\.id = b\.order_id/iu);
  assert.match(sql, /canonical_order\.booking_id IS DISTINCT FROM b\.id/iu);
  assert.match(sql, /SELECT count\(\*\)\s+FROM public\.orders linked_order\s+WHERE linked_order\.booking_id = b\.id[\s\S]*<> 1/iu);
  assert.match(sql, /MIDAO_REQUESTS_RELATION_INVALID/iu);
  assert.match(sql, /JOIN public\.activity_plans ap\s+ON ap\.id = b\.activity_plan_id\s+AND ap\.booking_type = 'request'/iu);
  assert.match(sql, /JOIN public\.activities a\s+ON a\.id = b\.activity_id/iu);
  assert.match(sql, /LEFT JOIN LATERAL\s*\([\s\S]*FROM public\.order_messages om[\s\S]*ORDER BY om\.created_at DESC, om\.id DESC\s+LIMIT 1/iu);
  assert.match(sql, /WHERE b\.guide_id = p_guide_id/iu);

  for (const bucket of ['new', 'needs_reply', 'replied', 'completed']) {
    assert.match(sql, new RegExp(`'${bucket}'`, 'u'));
  }
  for (const sort of ['priority', 'updated_desc', 'service_asc']) {
    assert.match(sql, new RegExp(`'${sort}'`, 'u'));
  }
  assert.match(sql, /ORDER BY[\s\S]*priority_rank[\s\S]*updated_at[\s\S]*booking_id/iu);
  assert.match(sql, /date_trunc\('milliseconds',\s*b\.start_at\) AS start_at/iu);
  assert.match(sql, /date_trunc\('milliseconds',\s*greatest\(b\.updated_at, o\.updated_at, COALESCE\(lm\.created_at, '-infinity'::timestamptz\)\)\) AS updated_at/iu);
  assert.match(sql, /LIMIT p_limit/iu);

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.midao_list_booking_requests\(uuid, text, text, integer, timestamptz, uuid, integer\) FROM PUBLIC/iu);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.midao_list_booking_requests\(uuid, text, text, integer, timestamptz, uuid, integer\) FROM anon, authenticated/iu);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.midao_list_booking_requests\(uuid, text, text, integer, timestamptz, uuid, integer\) TO service_role/iu);

  assert.doesNotMatch(sql, /admin_note|internal_note|customer_note|contact_phone|\bom\.body\b/iu);
});

test('Task14 read projection validates bucket, sort, cursor completeness, and limit fail closed', () => {
  assert.equal(existsSync(MIGRATION), true, `missing Task14 migration: ${MIGRATION}`);
  const sql = readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /IF p_guide_id IS NULL THEN/iu);
  assert.match(sql, /IF p_bucket IS NULL OR p_bucket NOT IN \('all', 'new', 'needs_reply', 'replied', 'completed'\) THEN/iu);
  assert.match(sql, /IF p_sort IS NULL OR p_sort NOT IN \('priority', 'updated_desc', 'service_asc'\) THEN/iu);
  assert.match(sql, /IF p_limit IS NULL OR p_limit < 1 OR p_limit > 51 THEN/iu);
  assert.match(sql, /num_nonnulls\(p_cursor_rank, p_cursor_at, p_cursor_id\) NOT IN \(0, 3\)/iu);
  assert.match(sql, /p_cursor_rank IS NOT NULL AND \(p_cursor_rank < 0 OR p_cursor_rank > 3\)/iu);
  assert.match(sql, /ERRCODE = '22023'/iu);
});

test('public standard-runner workflow pins Node 22.23.1 and executes the real Task14 PostgREST contract', () => {
  const workflow = readFileSync(repoFile('.github/workflows/midao-baseline-e2e.yml'), 'utf8');
  assert.match(workflow, /runs-on: ubuntu-latest/u);
  assert.doesNotMatch(workflow, /runs-on:\s*\[[^\]]*(?:larger|self-hosted)|runs-on:\s*(?:larger|self-hosted)/iu);
  assert.match(workflow, /node-version: '22\.23\.1'/u);
  assert.match(workflow, /- 'apps\/web\/src\/lib\/midao\/db-requests\.mjs'/u);
  assert.match(workflow, /- 'apps\/web\/tests\/api\/midao-\*\.test\.mjs'/u);
  assert.match(workflow, /with-midao-local-supabase\.mjs --postgrest\s+apps\/web\/tests\/integration\/midao-requests-postgrest\.test\.mjs/u);
  assert.match(workflow, /build-expected-terminal\.mjs\s+--runs 2\s+--baseline supabase\/baselines\/v1\s+--publish-dir supabase\/baselines\/v1/u);
  assert.match(workflow, /- name: Verify deterministic expected-terminal artifacts are committed[\s\S]*git diff --exit-code --[\s\S]*supabase\/baselines\/v1\/manifest\.json/u);
  assert.match(workflow, /name: midao-expected-terminal-\$\{\{ github\.sha \}\}[\s\S]*retention-days: 1/u);
  const uploadStepIndex = workflow.indexOf('- name: Upload deterministic expected-terminal artifacts');
  const verifyStepIndex = workflow.indexOf('- name: Verify deterministic expected-terminal artifacts are committed');
  assert.ok(
    uploadStepIndex >= 0 && uploadStepIndex < verifyStepIndex,
    'successful builder output must upload before the fail-closed committed diff gate',
  );
});

test('primary CI pins Node 22.23.1 and runs lock-backed typecheck before tests/build', () => {
  const workflow = readFileSync(repoFile('.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /node-version: '22\.23\.1'/u);
  assert.match(workflow, /- name: Web typecheck\n\s+run: npm run typecheck -w @tour\/web/u);
});

test('migration drift workflow keeps pull requests source-only and cannot send external failure notifications', () => {
  const workflow = readFileSync(repoFile('.github/workflows/migration-drift-detect.yml'), 'utf8');
  assert.match(workflow, /\n  drift-detect:\n    if: github\.event_name != 'pull_request'\n/u);
  assert.match(workflow, /node-version: '22\.23\.1'/u);
  assert.match(workflow, /- name: Notify on failure \(Telegram \+ Email\)\n\s+if: failure\(\) && github\.event_name != 'pull_request'/u);
});

test('trusted expected-terminal manifest pins and materializes the exact Task14 migration digest', () => {
  const bytes = readFileSync(MIGRATION);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const runner = readFileSync(repoFile('scripts/testing/with-midao-local-supabase.mjs'), 'utf8');
  const materializer = readFileSync(repoFile('scripts/database-baseline/materialize-fresh-workdir.mjs'), 'utf8');
  assert.match(materializer, new RegExp(`filename: '20260723004000_midao_request_read_projection\\.sql',[\\s\\S]*sha256: '${digest}'`, 'u'));
  assert.match(materializer, /validateExpectedTerminalManifest\(manifest\)/u);
  assert.match(runner, /postCutoffManifest: expected\.manifest/u);
  assert.doesNotMatch(runner, /REQUEST_PACKAGE_MIGRATIONS|repoRoot,\s*entries:/u);
  assert.match(runner, /migrationNames: \[\.\.\.materialized\.history\]/u);
});
