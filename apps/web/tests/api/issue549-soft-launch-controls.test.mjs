/**
 * Issue #549 — Soft-launch control mechanism foundation: contract tests
 *
 * All tests are static (no live DB needed). Verifies:
 * 1. Migration has soft_launch_controls table with new_booking_paused column
 * 2. Migration has soft_launch_control_audit table with control_key + reason
 * 3. Migration has soft_launch_whitelist with entry_type check constraint
 * 4. soft-launch.mjs exports getControls, setControl, isWhitelisted
 * 5. setControl writes audit entry
 * 6. isWhitelisted checks all 3 entry types
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(full), `File must exist: ${full}`);
  return fs.readFileSync(full, 'utf8');
}

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../supabase/migrations/20260516_issue549_soft_launch_controls.sql'
);

function readMigration() {
  assert.ok(fs.existsSync(MIGRATION_PATH), `Migration must exist: ${MIGRATION_PATH}`);
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

// ─── Migration: soft_launch_controls table ───────────────────────────────────
describe('Migration: soft_launch_controls table', () => {
  it('migration file exists', () => {
    assert.ok(fs.existsSync(MIGRATION_PATH), 'Migration file must exist');
  });

  it('creates soft_launch_controls table', () => {
    const sql = readMigration();
    assert.match(sql, /CREATE TABLE IF NOT EXISTS soft_launch_controls/i);
  });

  it('has new_booking_paused column', () => {
    const sql = readMigration();
    assert.match(sql, /new_booking_paused\s+boolean/i);
  });

  it('has public_paused column', () => {
    const sql = readMigration();
    assert.match(sql, /public_paused\s+boolean/i);
  });

  it('has refund_manual_only column', () => {
    const sql = readMigration();
    assert.match(sql, /refund_manual_only\s+boolean/i);
  });

  it('has whitelist_enabled column', () => {
    const sql = readMigration();
    assert.match(sql, /whitelist_enabled\s+boolean/i);
  });

  it('inserts singleton row', () => {
    const sql = readMigration();
    assert.match(sql, /INSERT INTO soft_launch_controls DEFAULT VALUES/i);
    assert.match(sql, /ON CONFLICT DO NOTHING/i);
  });

  it('enables RLS on soft_launch_controls', () => {
    const sql = readMigration();
    assert.match(sql, /ALTER TABLE soft_launch_controls ENABLE ROW LEVEL SECURITY/i);
  });
});

// ─── Migration: soft_launch_control_audit table ──────────────────────────────
describe('Migration: soft_launch_control_audit table', () => {
  it('creates soft_launch_control_audit table', () => {
    const sql = readMigration();
    assert.match(sql, /CREATE TABLE IF NOT EXISTS soft_launch_control_audit/i);
  });

  it('has control_key column', () => {
    const sql = readMigration();
    assert.match(sql, /control_key\s+text/i);
  });

  it('has reason column', () => {
    const sql = readMigration();
    assert.match(sql, /reason\s+text/i);
  });

  it('has actor column', () => {
    const sql = readMigration();
    assert.match(sql, /actor\s+text/i);
  });

  it('has from_value and to_value columns', () => {
    const sql = readMigration();
    assert.match(sql, /from_value\s+boolean/i);
    assert.match(sql, /to_value\s+boolean/i);
  });

  it('enables RLS on soft_launch_control_audit', () => {
    const sql = readMigration();
    assert.match(sql, /ALTER TABLE soft_launch_control_audit ENABLE ROW LEVEL SECURITY/i);
  });
});

// ─── Migration: soft_launch_whitelist table ───────────────────────────────────
describe('Migration: soft_launch_whitelist table', () => {
  it('creates soft_launch_whitelist table', () => {
    const sql = readMigration();
    assert.match(sql, /CREATE TABLE IF NOT EXISTS soft_launch_whitelist/i);
  });

  it('has entry_type column with CHECK constraint', () => {
    const sql = readMigration();
    assert.match(sql, /entry_type\s+text\s+NOT NULL\s+CHECK/i);
  });

  it('CHECK constraint includes traveler_user_id', () => {
    const sql = readMigration();
    assert.match(sql, /traveler_user_id/);
  });

  it('CHECK constraint includes activity_id', () => {
    const sql = readMigration();
    assert.match(sql, /activity_id/);
  });

  it('CHECK constraint includes guide_id', () => {
    const sql = readMigration();
    assert.match(sql, /guide_id/);
  });

  it('has UNIQUE constraint on (entry_type, value)', () => {
    const sql = readMigration();
    assert.match(sql, /UNIQUE\s*\(\s*entry_type\s*,\s*value\s*\)/i);
  });

  it('enables RLS on soft_launch_whitelist', () => {
    const sql = readMigration();
    assert.match(sql, /ALTER TABLE soft_launch_whitelist ENABLE ROW LEVEL SECURITY/i);
  });
});

// ─── soft-launch.mjs: exports ────────────────────────────────────────────────
describe('soft-launch.mjs: module structure', () => {
  it('soft-launch.mjs file exists', () => {
    const libPath = path.join(ROOT, 'src/lib/soft-launch.mjs');
    assert.ok(fs.existsSync(libPath), `soft-launch.mjs must exist: ${libPath}`);
  });

  it('exports getControls', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /export\s+async\s+function\s+getControls/);
  });

  it('exports setControl', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /export\s+async\s+function\s+setControl/);
  });

  it('exports isWhitelisted', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /export\s+async\s+function\s+isWhitelisted/);
  });
});

// ─── soft-launch.mjs: setControl writes audit ────────────────────────────────
describe('soft-launch.mjs: setControl audit behavior', () => {
  it('setControl inserts into soft_launch_control_audit', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /soft_launch_control_audit/);
    assert.match(src, /\.insert\(/);
  });

  it('setControl updates soft_launch_controls', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /soft_launch_controls/);
    assert.match(src, /\.update\(/);
  });

  it('setControl records from_value and to_value', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /from_value/);
    assert.match(src, /to_value/);
  });

  it('setControl records actor and reason', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /actor/);
    assert.match(src, /reason/);
  });
});

// ─── soft-launch.mjs: isWhitelisted checks all 3 entry types ─────────────────
describe('soft-launch.mjs: isWhitelisted entry type coverage', () => {
  it('checks traveler_user_id entry type', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /traveler_user_id/);
  });

  it('checks activity_id entry type', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /activity_id/);
  });

  it('checks guide_id entry type', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /guide_id/);
  });

  it('returns false when no checks provided', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /if\s*\(!checks\.length\)\s*return false/);
  });

  it('queries soft_launch_whitelist table', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    assert.match(src, /soft_launch_whitelist/);
  });
});

// ─── getControls: safe fallback on error ─────────────────────────────────────
describe('soft-launch.mjs: getControls fallback', () => {
  it('returns safe defaults on DB error', () => {
    const src = readFile('src/lib/soft-launch.mjs');
    // Must return default false values if error
    assert.match(src, /if\s*\(\s*error\s*\)/);
    assert.match(src, /public_paused:\s*false/);
    assert.match(src, /new_booking_paused:\s*false/);
  });
});
