/**
 * Issue #322: Schema extension contract tests
 * Static analysis of migration SQL — no live DB required.
 *
 * AC1 - activities table gets 6 new nullable columns
 * AC2 - activity_images table created with required columns/index
 * AC3 - activity_plan_tiers table created with UNIQUE(plan_id, tier)
 * AC7 - rollback file exists and drops everything the forward migration adds
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../supabase/migrations');

const FORWARD_FILE = path.join(MIGRATIONS_DIR, '20260511_issue322_guide_activity_authoring.sql');
const ROLLBACK_FILE = path.join(MIGRATIONS_DIR, '20260511_issue322_guide_activity_authoring.rollback.sql');

function readMigration(filePath) {
  assert.ok(fs.existsSync(filePath), `Migration file must exist: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

describe('Issue 322 schema extension - forward migration', () => {
  it('AC1: migration file exists', () => {
    assert.ok(fs.existsSync(FORWARD_FILE), `Forward migration must exist: ${FORWARD_FILE}`);
  });

  it('AC1: adds dismissal_point column to activities (nullable text)', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS\s+dismissal_point\s+text/i,
      'Must add dismissal_point text column');
  });

  it('AC1: adds dismissal_point_map_url column to activities (nullable text)', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS\s+dismissal_point_map_url\s+text/i,
      'Must add dismissal_point_map_url text column');
  });

  it('AC1: adds meeting_lat column to activities (nullable numeric)', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS\s+meeting_lat\s+numeric/i,
      'Must add meeting_lat numeric column');
  });

  it('AC1: adds meeting_lng column to activities (nullable numeric)', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS\s+meeting_lng\s+numeric/i,
      'Must add meeting_lng numeric column');
  });

  it('AC1: adds dismissal_lat column to activities (nullable numeric)', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS\s+dismissal_lat\s+numeric/i,
      'Must add dismissal_lat numeric column');
  });

  it('AC1: adds dismissal_lng column to activities (nullable numeric)', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS\s+dismissal_lng\s+numeric/i,
      'Must add dismissal_lng numeric column');
  });

  it('AC2: creates activity_images table', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+(public\.)?activity_images/i,
      'Must CREATE TABLE IF NOT EXISTS activity_images');
  });

  it('AC2: activity_images has id uuid PK', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /activity_images[\s\S]{0,500}id\s+uuid\s+PRIMARY KEY/i,
      'activity_images must have id uuid PRIMARY KEY');
  });

  it('AC2: activity_images has activity_id FK', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /activity_images[\s\S]{0,500}activity_id\s+uuid[\s\S]{0,200}REFERENCES\s+(public\.)?activities/i,
      'activity_images must have activity_id FK to activities');
  });

  it('AC2: activity_images has url NOT NULL', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /activity_images[\s\S]{0,500}url\s+text\s+NOT NULL/i,
      'activity_images must have url text NOT NULL');
  });

  it('AC2: activity_images has kind CHECK with cover/gallery', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /activity_images[\s\S]{0,800}kind[\s\S]{0,200}CHECK[\s\S]{0,100}(cover|gallery)/i,
      'activity_images must have kind with CHECK constraint for cover/gallery');
  });

  it('AC2: activity_images has sort_order NOT NULL DEFAULT 0', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /activity_images[\s\S]{0,800}sort_order\s+int(?:eger)?\s+NOT NULL\s+DEFAULT\s+0/i,
      'activity_images must have sort_order int NOT NULL DEFAULT 0');
  });

  it('AC2: index on activity_images(activity_id, sort_order)', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS[\s\S]{0,200}activity_images[\s\S]{0,100}\([\s\S]{0,50}activity_id[\s\S]{0,30},[\s\S]{0,30}sort_order[\s\S]{0,10}\)/i,
      'Must create index on activity_images(activity_id, sort_order)');
  });

  it('AC3: creates activity_plan_tiers table', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+(public\.)?activity_plan_tiers/i,
      'Must CREATE TABLE IF NOT EXISTS activity_plan_tiers');
  });

  it('AC3: activity_plan_tiers has plan_id FK', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /activity_plan_tiers[\s\S]{0,500}plan_id\s+uuid[\s\S]{0,200}REFERENCES\s+(public\.)?activity_plans/i,
      'activity_plan_tiers must have plan_id FK to activity_plans');
  });

  it('AC3: activity_plan_tiers has tier CHECK with adult/child/infant', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /activity_plan_tiers[\s\S]{0,800}tier[\s\S]{0,200}CHECK[\s\S]{0,100}(adult|child|infant)/i,
      'activity_plan_tiers must have tier with CHECK constraint for adult/child/infant');
  });

  it('AC3: activity_plan_tiers has price_twd integer NOT NULL', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /activity_plan_tiers[\s\S]{0,800}price_twd\s+integer\s+NOT NULL/i,
      'activity_plan_tiers must have price_twd integer NOT NULL');
  });

  it('AC3: activity_plan_tiers has UNIQUE(plan_id, tier)', () => {
    const sql = readMigration(FORWARD_FILE);
    assert.match(sql, /UNIQUE\s*\(\s*plan_id\s*,\s*tier\s*\)/i,
      'activity_plan_tiers must have UNIQUE(plan_id, tier)');
  });

  it('AC7: rollback file exists', () => {
    assert.ok(fs.existsSync(ROLLBACK_FILE), `Rollback file must exist: ${ROLLBACK_FILE}`);
  });

  it('AC7: rollback drops activity_images table', () => {
    const sql = readMigration(ROLLBACK_FILE);
    assert.match(sql, /DROP TABLE IF EXISTS\s+(public\.)?activity_images/i,
      'Rollback must drop activity_images table');
  });

  it('AC7: rollback drops activity_plan_tiers table', () => {
    const sql = readMigration(ROLLBACK_FILE);
    assert.match(sql, /DROP TABLE IF EXISTS\s+(public\.)?activity_plan_tiers/i,
      'Rollback must drop activity_plan_tiers table');
  });

  it('AC7: rollback drops dismissal_point column from activities', () => {
    const sql = readMigration(ROLLBACK_FILE);
    assert.match(sql, /DROP COLUMN IF EXISTS\s+dismissal_point/i,
      'Rollback must drop dismissal_point column');
  });

  it('AC7: rollback drops meeting_lat column from activities', () => {
    const sql = readMigration(ROLLBACK_FILE);
    assert.match(sql, /DROP COLUMN IF EXISTS\s+meeting_lat/i,
      'Rollback must drop meeting_lat column');
  });
});
