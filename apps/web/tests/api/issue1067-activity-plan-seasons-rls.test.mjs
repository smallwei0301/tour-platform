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
    migrationText.includes('CREATE POLICY "Activity plan seasons read for anonymous"'),
    true,
    'Anonymous read policy should be defined with CREATE POLICY',
  );

  assert.ok(migrationText.includes('DO $$'), 'Migration should wrap idempotent policy creation in DO block');
  assert.ok(
    migrationText.includes('IF NOT EXISTS ('),
    'Migration should use explicit pg_policies guard for idempotency',
  );
  assert.ok(
    migrationText.includes("FROM pg_policies"),
    'Migration should check catalog for existing policy before CREATE POLICY',
  );
  assert.ok(
    migrationText.includes("policyname = 'Activity plan seasons read for anonymous'"),
    'Migration should guard by policy name',
  );
  assert.ok(
    migrationText.includes('CREATE POLICY "Activity plan seasons read for anonymous"'),
    'Anonymous read policy definition should exist',
  );
  assert.ok(
    migrationText.includes('ON public.activity_plan_seasons'),
    'Policy should target activity_plan_seasons table',
  );
  assert.ok(migrationText.includes('FOR SELECT'), 'Policy must be select-only');
  assert.ok(migrationText.includes('TO anon'), 'Anonymous role must be granted read access');
  assert.ok(migrationText.includes('USING (is_active)'), 'Anonymous read should only expose active seasons');
});
