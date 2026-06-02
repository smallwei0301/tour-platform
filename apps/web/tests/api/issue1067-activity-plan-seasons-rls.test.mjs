import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const migrationPath = path.join(projectRoot, '..', '..', 'supabase', 'migrations', '20260603_issue1067_activity_plan_seasons_anon_read.sql');

const migrationText = readFileSync(migrationPath, 'utf8');

test('GH-1067: anonymous role has activity_plan_seasons read policy for public booking flows', () => {
  assert.equal(
    migrationText.includes('create policy if not exists "Activity plan seasons read for anonymous"'),
    true,
    'Missing anonymous read policy definition',
  );

  assert.equal(migrationText.includes('for select'), true, 'Policy must be select-only');
  assert.equal(migrationText.includes('to anon'), true, 'Anonymous role must be granted read access');
  assert.equal(migrationText.includes('using (is_active)'), true, 'Anonymous read should only expose active seasons');
});
