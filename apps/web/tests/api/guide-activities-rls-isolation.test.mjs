/**
 * Issue #322: Guide RLS isolation contract tests
 * Static analysis of migration SQL for RLS policies — no live DB required.
 *
 * AC4 - Guide can only SELECT their own activities (guide_id = their guide_profiles.id)
 * AC5 - Guide UPDATE on another guide's activity touches 0 rows (RLS hides the row)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../supabase/migrations');
const FORWARD_FILE = path.join(MIGRATIONS_DIR, '20260511_issue322_guide_activity_authoring.sql');

function readMigration(filePath) {
  assert.ok(fs.existsSync(filePath), `Migration file must exist: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

describe('Issue 322 RLS isolation - guide-owned activities', () => {
  it('migration file exists', () => {
    assert.ok(fs.existsSync(FORWARD_FILE), `Forward migration must exist: ${FORWARD_FILE}`);
  });

  it('AC4: activities has guide SELECT policy scoped to guide_id', () => {
    const sql = readMigration(FORWARD_FILE);
    // Policy for SELECT on activities using guide_id = subquery on guide_profiles
    const hasGuideSelectPolicy = /CREATE POLICY[\s\S]{0,200}activities[\s\S]{0,200}FOR SELECT[\s\S]{0,500}guide_id[\s\S]{0,300}guide_profiles[\s\S]{0,200}user_id\s*=\s*auth\.uid\(\)/i.test(sql)
      || /CREATE POLICY[\s\S]{0,200}activities[\s\S]{0,200}guide[\s\S]{0,200}select[\s\S]{0,500}guide_profiles[\s\S]{0,300}auth\.uid\(\)/i.test(sql);
    assert.ok(hasGuideSelectPolicy,
      'Must have a CREATE POLICY on activities for guide SELECT scoped to auth.uid() via guide_profiles');
  });

  it('AC4: activities guide SELECT policy references guide_profiles.user_id = auth.uid()', () => {
    const sql = readMigration(FORWARD_FILE);
    // Must link guide_id to guide_profiles lookup using auth.uid()
    assert.match(sql, /guide_profiles[\s\S]{0,200}user_id\s*=\s*auth\.uid\(\)/i,
      'RLS must use (SELECT id FROM guide_profiles WHERE user_id = auth.uid()) pattern');
  });

  it('AC5: activities has guide UPDATE policy (UPDATE can only match guide-owned rows)', () => {
    const sql = readMigration(FORWARD_FILE);
    // UPDATE policy must be scoped — guide only sees their rows, so UPDATE on other guide rows = 0 rows
    const hasGuideUpdatePolicy = /CREATE POLICY[\s\S]{0,200}activities[\s\S]{0,200}FOR\s+UPDATE[\s\S]{0,500}guide_profiles[\s\S]{0,200}auth\.uid\(\)/i.test(sql)
      || /CREATE POLICY[\s\S]{0,200}guide[\s\S]{0,100}update[\s\S]{0,100}activities[\s\S]{0,500}guide_profiles[\s\S]{0,200}auth\.uid\(\)/i.test(sql);
    assert.ok(hasGuideUpdatePolicy,
      'Must have guide UPDATE policy on activities (scoped → update on non-owned rows = 0 rows affected)');
  });

  it('AC4+AC5: activities has guide INSERT policy', () => {
    const sql = readMigration(FORWARD_FILE);
    const hasGuideInsertPolicy = /CREATE POLICY[\s\S]{0,400}activities[\s\S]{0,200}FOR\s+INSERT[\s\S]{0,500}guide_profiles[\s\S]{0,200}auth\.uid\(\)/i.test(sql)
      || /WITH CHECK[\s\S]{0,200}guide_profiles[\s\S]{0,200}auth\.uid\(\)/i.test(sql);
    assert.ok(hasGuideInsertPolicy,
      'Must have guide INSERT policy on activities with WITH CHECK using guide_profiles lookup');
  });

  it('AC4: activity_images has guide RLS policy scoped via activities.guide_id', () => {
    const sql = readMigration(FORWARD_FILE);
    const hasImagePolicy = /CREATE POLICY[\s\S]{0,300}activity_images[\s\S]{0,500}guide_profiles[\s\S]{0,200}auth\.uid\(\)/i.test(sql)
      || /CREATE POLICY[\s\S]{0,300}activity_images[\s\S]{0,300}(activities|guide)/i.test(sql);
    assert.ok(hasImagePolicy,
      'Must have RLS policy on activity_images referencing guide ownership chain');
  });

  it('AC4: activity_plan_tiers has guide RLS policy scoped via plans → activities.guide_id', () => {
    const sql = readMigration(FORWARD_FILE);
    const hasTierPolicy = /CREATE POLICY[\s\S]{0,300}activity_plan_tiers[\s\S]{0,500}guide_profiles[\s\S]{0,200}auth\.uid\(\)/i.test(sql)
      || /CREATE POLICY[\s\S]{0,300}activity_plan_tiers[\s\S]{0,300}(activity_plans|activities|guide)/i.test(sql);
    assert.ok(hasTierPolicy,
      'Must have RLS policy on activity_plan_tiers referencing guide ownership chain');
  });

  it('AC4: policies use idempotent DO block to avoid duplicate policy errors', () => {
    const sql = readMigration(FORWARD_FILE);
    // Either uses DO $$ IF NOT EXISTS or DROP POLICY IF EXISTS before CREATE
    const isIdempotent = /DO\s+\$\$[\s\S]{0,200}pg_policies/i.test(sql)
      || /DROP POLICY IF EXISTS/i.test(sql)
      || /IF NOT EXISTS\s*\(\s*SELECT[\s\S]{0,200}pg_policies/i.test(sql);
    assert.ok(isIdempotent,
      'RLS policy creation must be idempotent (use DO block with pg_policies check or DROP IF EXISTS)');
  });
});
