/**
 * Issue #401 — activity_qa: add updated_at column
 * Contract tests (static-analysis style, no live DB)
 *
 * AC1 — forward migration file exists with correct idempotent ADD COLUMN
 * AC2 — migration includes NOT NULL DEFAULT now()
 * AC3 — migration creates auto-update trigger
 * AC4 — rollback file exists with DROP COLUMN
 * AC5 — both PATCH routes still reference updated_at in their update payload (contract lock-in)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const MIGRATIONS_DIR = path.resolve(ROOT, '../../supabase/migrations');
const MIGRATION_FILE = path.join(
  MIGRATIONS_DIR,
  '20260512_issue401_activity_qa_updated_at.sql'
);
const ROLLBACK_FILE = path.join(
  MIGRATIONS_DIR,
  '20260512_issue401_activity_qa_updated_at.rollback.sql'
);

// ---------------------------------------------------------------------------
// AC1 — forward migration exists with idempotent ADD COLUMN
// ---------------------------------------------------------------------------
describe('Issue 401 — AC1: forward migration file exists', () => {
  it('AC1: migration file exists', () => {
    assert.ok(
      fs.existsSync(MIGRATION_FILE),
      `Migration must exist: ${MIGRATION_FILE}`
    );
  });

  it('AC1: migration uses ADD COLUMN IF NOT EXISTS updated_at timestamptz', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(
      sql,
      /ADD COLUMN IF NOT EXISTS\s+updated_at\s+timestamptz/i,
      'Must use ADD COLUMN IF NOT EXISTS updated_at timestamptz'
    );
  });
});

// ---------------------------------------------------------------------------
// AC2 — column is NOT NULL DEFAULT now()
// ---------------------------------------------------------------------------
describe('Issue 401 — AC2: updated_at is NOT NULL DEFAULT now()', () => {
  it('AC2: migration specifies NOT NULL DEFAULT now()', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(
      sql,
      /updated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i,
      'updated_at must be NOT NULL DEFAULT now()'
    );
  });
});

// ---------------------------------------------------------------------------
// AC3 — auto-update trigger is created
// ---------------------------------------------------------------------------
describe('Issue 401 — AC3: auto-update trigger created', () => {
  it('AC3: migration creates set_activity_qa_updated_at function', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION\s+(public\.)?set_activity_qa_updated_at/i,
      'Must create set_activity_qa_updated_at trigger function'
    );
  });

  it('AC3: migration creates trg_activity_qa_updated_at trigger BEFORE UPDATE', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(
      sql,
      /CREATE TRIGGER\s+trg_activity_qa_updated_at/i,
      'Must create trg_activity_qa_updated_at trigger'
    );
    assert.match(
      sql,
      /BEFORE UPDATE\s+ON\s+(public\.)?activity_qa/i,
      'Trigger must fire BEFORE UPDATE on activity_qa'
    );
  });

  it('AC3: trigger uses DROP TRIGGER IF EXISTS for idempotency', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(
      sql,
      /DROP TRIGGER IF EXISTS\s+trg_activity_qa_updated_at/i,
      'Must DROP TRIGGER IF EXISTS before CREATE TRIGGER for idempotency'
    );
  });
});

// ---------------------------------------------------------------------------
// AC4 — rollback file exists and drops column + trigger + function
// ---------------------------------------------------------------------------
describe('Issue 401 — AC4: rollback file exists and is complete', () => {
  it('AC4: rollback file exists', () => {
    assert.ok(
      fs.existsSync(ROLLBACK_FILE),
      `Rollback file must exist: ${ROLLBACK_FILE}`
    );
  });

  it('AC4: rollback drops trg_activity_qa_updated_at trigger', () => {
    const sql = fs.readFileSync(ROLLBACK_FILE, 'utf8');
    assert.match(
      sql,
      /DROP TRIGGER IF EXISTS\s+trg_activity_qa_updated_at/i,
      'Rollback must drop trg_activity_qa_updated_at'
    );
  });

  it('AC4: rollback drops set_activity_qa_updated_at function', () => {
    const sql = fs.readFileSync(ROLLBACK_FILE, 'utf8');
    assert.match(
      sql,
      /DROP FUNCTION IF EXISTS\s+(public\.)?set_activity_qa_updated_at/i,
      'Rollback must drop set_activity_qa_updated_at function'
    );
  });

  it('AC4: rollback uses DROP COLUMN IF EXISTS updated_at', () => {
    const sql = fs.readFileSync(ROLLBACK_FILE, 'utf8');
    assert.match(
      sql,
      /DROP COLUMN IF EXISTS\s+updated_at/i,
      'Rollback must DROP COLUMN IF EXISTS updated_at'
    );
  });
});

// ---------------------------------------------------------------------------
// AC5 — both PATCH routes still reference updated_at (contract lock-in)
// ---------------------------------------------------------------------------
describe('Issue 401 — AC5: PATCH routes still write updated_at', () => {
  it('AC5: admin PATCH route writes updated_at in update payload', () => {
    const routePath = path.join(
      ROOT,
      'app/api/admin/qa/[id]/route.ts'
    );
    assert.ok(fs.existsSync(routePath), `Route must exist: ${routePath}`);
    const src = fs.readFileSync(routePath, 'utf8');
    assert.match(
      src,
      /updated_at\s*:/,
      'Admin PATCH route must include updated_at in update payload'
    );
  });

  it('AC5: guide PATCH route writes updated_at in update payload', () => {
    const routePath = path.join(
      ROOT,
      'app/api/guide/qa/[id]/route.ts'
    );
    assert.ok(fs.existsSync(routePath), `Route must exist: ${routePath}`);
    const src = fs.readFileSync(routePath, 'utf8');
    assert.match(
      src,
      /updated_at\s*:/,
      'Guide PATCH route must include updated_at in update payload'
    );
  });
});
