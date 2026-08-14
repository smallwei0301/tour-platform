import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const scopeMigration = path.join(migrationsDir, '20260814130000_issue1760_availability_scope_contract.sql');
const scopeRollback = path.join(migrationsDir, '20260814130000_issue1760_availability_scope_contract.rollback.sql');
const dayMigration = path.join(migrationsDir, '20260814130100_issue1760_atomic_day_availability.sql');
const dayRollback = path.join(migrationsDir, '20260814130100_issue1760_atomic_day_availability.rollback.sql');
const baseMaxMigration = '20260813085910_issue1825_legacy_midao_draft_materialization.sql';

function readRequired(file) {
  assert.equal(fs.existsSync(file), true, `required migration must exist: ${path.basename(file)}`);
  return fs.readFileSync(file, 'utf8');
}

function assertNoForbiddenSurface(sql) {
  assert.doesNotMatch(sql, /\/midao2|\/api\/v2\/guide\/midao/iu);
  assert.doesNotMatch(sql, /create\s+table(?:\s+if\s+not\s+exists)?\s+[^;(]*\b(?:calendar|slot)\b/iu);
}

test('issue #1760 migration filenames are strictly newer than the exact base maximum', () => {
  const forward = [
    path.basename(scopeMigration),
    path.basename(dayMigration),
  ];
  for (const filename of forward) {
    assert.ok(filename > baseMaxMigration, `${filename} must be after ${baseMaxMigration}`);
  }
  assert.equal(path.basename(scopeMigration), '20260814130000_issue1760_availability_scope_contract.sql');
  assert.equal(path.basename(scopeRollback), '20260814130000_issue1760_availability_scope_contract.rollback.sql');
  assert.equal(path.basename(dayMigration), '20260814130100_issue1760_atomic_day_availability.sql');
  assert.equal(path.basename(dayRollback), '20260814130100_issue1760_atomic_day_availability.rollback.sql');
});

test('issue #1760 scope contract keeps legacy writers coherent and revisioned', () => {
  const sql = readRequired(scopeMigration);
  assertNoForbiddenSurface(sql);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+scope_type\s+text/iu);
  assert.match(sql, /update\s+public\.guide_availability_rules[\s\S]*?activity_plan_id\s+is\s+null[\s\S]*?'global'[\s\S]*?'plan'/iu);
  assert.match(sql, /alter\s+column\s+scope_type\s+set\s+not\s+null/iu);
  assert.match(sql, /scope_type\s*=\s*'global'\s+and\s+activity_plan_id\s+is\s+null[\s\S]*?scope_type\s*=\s*'plan'\s+and\s+activity_plan_id\s+is\s+not\s+null/iu);
  assert.match(sql, /create(?:\s+or\s+replace)?\s+function\s+public\.guide_availability_rules_scope_revision_trigger/iu);
  assert.match(sql, /create\s+trigger[\s\S]*?before\s+insert\s+or\s+update[\s\S]*?guide_availability_rules_scope_revision_trigger/iu);
  assert.match(sql, /new\.scope_type\s*:=\s*case\s+when\s+new\.activity_plan_id\s+is\s+null\s+then\s+'global'\s+else\s+'plan'\s+end/iu);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+revision\s+bigint\s+not\s+null\s+default\s+1/iu);
  assert.match(sql, /revision\s*>\s*0/iu);
  assert.match(sql, /old\.revision\s*\+\s*1/iu);
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+availability_policy\s+text/iu);
  assert.match(sql, /update\s+public\.activity_plans[\s\S]*?set\s+availability_policy\s*=\s*'inherit'[\s\S]*?where\s+availability_policy\s+is\s+null/iu);
  assert.match(sql, /alter\s+column\s+availability_policy\s+set\s+default\s+'inherit'[\s\S]*?alter\s+column\s+availability_policy\s+set\s+not\s+null/iu);
  assert.match(sql, /availability_policy\s+in\s*\(\s*'inherit'\s*,\s*'restrict'\s*,\s*'closed'\s*\)/iu);
  assert.match(sql, /create\s+index\s+if\s+not\s+exists[\s\S]*?on\s+public\.guide_availability_rules\s*\(\s*guide_id\s*,\s*effective_from\s*,\s*effective_to\s*,\s*weekday\s*\)[\s\S]*?where\s+is_active\s+and\s+scope_type\s*=\s*'global'/iu);
});

test('issue #1760 day CAS RPC is service-role-only, serialized, idempotent, and tombstone-safe', () => {
  const sql = readRequired(dayMigration);
  assertNoForbiddenSurface(sql);
  assert.doesNotMatch(sql, /pg_catalog\.extract\s*\(/iu, 'EXTRACT is SQL syntax and must not be schema-qualified');
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.guide_availability_day_revisions/iu);
  assert.match(sql, /primary\s+key\s*\(\s*guide_id\s*,\s*local_date\s*\)/iu);
  assert.match(sql, /revision\s+bigint\s+not\s+null\s+default\s+0/iu);
  assert.match(sql, /check\s*\(\s*revision\s*>=\s*0\s*\)/iu);
  assert.match(sql, /alter\s+table\s+public\.guide_availability_day_revisions\s+enable\s+row\s+level\s+security/iu);
  assert.match(sql, /alter\s+table\s+public\.guide_availability_day_revisions\s+force\s+row\s+level\s+security/iu);
  assert.match(sql, /revoke\s+all\s+on\s+table\s+public\.guide_availability_day_revisions\s+from\s+public\s*,\s*anon\s*,\s*authenticated/iu);
  assert.match(sql, /grant\s+(?:select\s*,\s*)?insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.guide_availability_day_revisions\s+to\s+service_role/iu);
  assert.match(sql, /create(?:\s+or\s+replace)?\s+function\s+public\.midao_replace_global_day_availability\s*\(\s*p_guide_id\s+uuid\s*,\s*p_local_date\s+date\s*,\s*p_timezone\s+text\s*,\s*p_expected_revision\s+bigint\s*,\s*p_ranges\s+jsonb\s*,\s*p_idempotency_key\s+text\s*,\s*p_request_hash\s+text\s*\)/iu);
  assert.match(sql, /returns\s+jsonb[\s\S]*?security\s+definer[\s\S]*?set\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/iu);
  assert.match(sql, /insert\s+into\s+public\.guide_availability_day_revisions[\s\S]*?on\s+conflict\s*\(\s*guide_id\s*,\s*local_date\s*\)\s+do\s+nothing/iu);
  assert.match(sql, /from\s+public\.guide_availability_day_revisions[\s\S]*?for\s+update/iu);
  assert.match(sql, /'day_timezone_mismatch'[\s\S]*?422/iu);
  assert.match(sql, /'revision_conflict'[\s\S]*?409[\s\S]*?currentRevision/iu);
  assert.match(sql, /public\.midao_idempotency_records[\s\S]*?for\s+update/iu);
  assert.match(sql, /'idempotency_key_reused'[\s\S]*?409/iu);
  assert.doesNotMatch(sql, /'idempotency_in_progress'/iu, 'duplicate requests must wait for the locked idempotency record and replay its completed response, never return a placeholder');
  assert.match(sql, /jsonb_typeof\s*\(\s*p_ranges\s*\)\s*<>\s*'array'/iu);
  assert.match(sql, /startTimeLocal[\s\S]*?endTimeLocal/iu);
  assert.match(sql, /scope_type\s*=\s*'global'[\s\S]*?effective_from\s*=\s*p_local_date[\s\S]*?effective_to\s*=\s*p_local_date/iu);
  assert.match(sql, /is_closed\s*=\s*\(\s*(?:pg_catalog\.)?jsonb_array_length\s*\(\s*p_ranges\s*\)\s*=\s*0\s*\)/iu);
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.midao_replace_global_day_availability[\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated/iu);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.midao_replace_global_day_availability[\s\S]*?to\s+service_role/iu);
});

test('issue #1760 rollback companions preserve persisted day availability state fail-closed', () => {
  for (const rollback of [scopeRollback, dayRollback]) {
    const sql = readRequired(rollback);
    assertNoForbiddenSurface(sql);
    assert.doesNotMatch(sql, /\bdrop\s+table\b|\bdelete\s+from\b|\btruncate\b/iu);
  }
  assert.match(readRequired(dayRollback), /revoke\s+all\s+on\s+function\s+public\.midao_replace_global_day_availability/iu);
});
