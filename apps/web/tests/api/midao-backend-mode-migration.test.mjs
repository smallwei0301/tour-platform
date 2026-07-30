import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, '../../../../supabase/migrations/20260723000000_midao_backend_mode.sql');

function migrationSql() {
  assert.equal(fs.existsSync(migrationPath), true, 'backend_mode migration file must exist');
  return fs.readFileSync(migrationPath, 'utf8');
}

test('backend_mode migration adds an additive legacy-default column', () => {
  const sql = migrationSql();
  assert.match(sql, /ALTER\s+TABLE\s+public\.guide_profiles[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+backend_mode\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'legacy'/iu);
  assert.doesNotMatch(sql, /guide_session_version/iu);
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN|CONSTRAINT)|ALTER\s+COLUMN/iu);
});

test('backend_mode migration installs an idempotent named value constraint', () => {
  const sql = migrationSql();
  assert.match(sql, /midao_guide_profiles_backend_mode_check/iu);
  assert.match(sql, /backend_mode\s+IN\s*\(\s*'legacy'\s*,\s*'midao'\s*\)/iu);
  assert.match(sql, /pg_constraint|information_schema\.table_constraints/iu);
});

test('backend_mode migration creates the mode lookup index', () => {
  const sql = migrationSql();
  assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+midao_guide_profiles_backend_mode_idx\s+ON\s+public\.guide_profiles\s*\(\s*backend_mode\s*\)/iu);
});

test('backend_mode migration documents the rollout semantics', () => {
  const sql = migrationSql();
  assert.match(sql, /COMMENT\s+ON\s+COLUMN\s+public\.guide_profiles\.backend_mode\s+IS\s+'/iu);
  assert.match(sql, /legacy/iu);
  assert.match(sql, /midao/iu);
});
