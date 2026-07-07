import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(TEST_DIR, '../..');
const REPO_ROOT = path.resolve(TEST_DIR, '../../../..');

function readFrom(baseDir, relPath) {
  const full = path.resolve(baseDir, relPath);
  assert.ok(fs.existsSync(full), `file must exist: ${full}`);
  return fs.readFileSync(full, 'utf8');
}

describe('Issue 600 payout guide email schema/query contract', () => {
  it('admin payouts route must use guide_profiles(display_name, guide_email)', () => {
    const src = readFrom(WEB_ROOT, 'app/api/v2/admin/payouts/route.ts');
    assert.match(src, /guide_profiles\s*\(\s*display_name\s*,\s*guide_email\s*\)/);
    assert.doesNotMatch(src, /guide_profiles\s*\(\s*display_name\s*,\s*email\s*\)/);
  });

  it('schema drift preflight must probe payouts relation via guide_email, not email', () => {
    const src = readFrom(REPO_ROOT, 'scripts/production-schema-drift-preflight.mjs');
    assert.match(src, /guide_profiles\(display_name, guide_email\)/);
    assert.doesNotMatch(src, /guide_profiles\(display_name, email\)/);
  });

  it('issue600 migration must add guide_profiles.guide_email contract column', () => {
    const migration = readFrom(REPO_ROOT, 'supabase/migrations/20260518_issue600_guide_profiles_guide_email_contract.sql');

    assert.match(migration, /ADD COLUMN IF NOT EXISTS guide_email\s+text/i);
    assert.match(migration, /UPDATE\s+public\.guide_profiles[\s\S]*FROM\s+public\.users/i);
    assert.match(migration, /CREATE INDEX IF NOT EXISTS guide_profiles_guide_email_idx/i);
  });
});
