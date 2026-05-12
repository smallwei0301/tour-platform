/**
 * Issue #405 — [Agent Fix] Wishlist schema ensure-migration contract tests
 * Static-analysis style tests: read migration source files and assert contracts.
 * No live DB required.
 *
 * AC1 — ensure-migration file exists
 * AC2 — contains CREATE TABLE IF NOT EXISTS public.wishlists with required columns
 * AC3 — contains ENABLE ROW LEVEL SECURITY
 * AC4 — contains all 4 RLS policies (select_own, insert_own, delete_own, service_all)
 * AC5 — contains schema cache reload (pg_notify)
 * AC6 — rollback file exists and contains DROP TABLE IF EXISTS public.wishlists
 * AC7 — #431 FK repair migration exists and has uuid type + FK constraint + schema reload
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
  '20260512_issue405_wishlists_ensure.sql'
);
const ROLLBACK_FILE = path.join(
  MIGRATIONS_DIR,
  '20260512_issue405_wishlists_ensure.rollback.sql'
);
const FK_REPAIR_FILE = path.join(
  MIGRATIONS_DIR,
  '20260513_issue431_wishlists_fk_repair.sql'
);

// ---------------------------------------------------------------------------
// AC1 — ensure-migration file exists
// ---------------------------------------------------------------------------
describe('Issue 405 — AC1: ensure-migration file exists', () => {
  it('AC1: migration file exists', () => {
    assert.ok(
      fs.existsSync(MIGRATION_FILE),
      `Migration must exist: ${MIGRATION_FILE}`
    );
  });
});

// ---------------------------------------------------------------------------
// AC2 — CREATE TABLE IF NOT EXISTS with required columns
// ---------------------------------------------------------------------------
describe('Issue 405 — AC2: idempotent CREATE TABLE IF NOT EXISTS', () => {
  it('AC2: contains CREATE TABLE IF NOT EXISTS public.wishlists', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(
      sql,
      /CREATE TABLE IF NOT EXISTS\s+public\.wishlists/i,
      'Must use CREATE TABLE IF NOT EXISTS public.wishlists'
    );
  });

  it('AC2: contains user_id column definition', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(
      sql,
      /user_id\s+uuid\s+NOT NULL/i,
      'Must define user_id uuid NOT NULL column'
    );
  });

  it('AC2: contains activity_id column definition (text; will be repaired to uuid by #431 migration)', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    // The original ensure-migration uses text (wrong type). The #431 repair migration
    // converts it to uuid + adds FK. We assert text here to document the original state;
    // see AC7 for the corrected uuid + FK assertions.
    assert.match(
      sql,
      /activity_id\s+text\s+NOT NULL/i,
      'Must define activity_id text NOT NULL column (original; repaired by #431 migration)'
    );
  });

  it('AC2: contains added_at timestamptz column', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(
      sql,
      /added_at\s+timestamptz/i,
      'Must define added_at timestamptz column'
    );
  });

  it('AC2: contains unique constraint on (user_id, activity_id)', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasUnique =
      /UNIQUE\s*\(\s*user_id\s*,\s*activity_id\s*\)/i.test(sql) ||
      /CONSTRAINT\s+\w+\s+UNIQUE\s*\(\s*user_id\s*,\s*activity_id\s*\)/i.test(sql);
    assert.ok(hasUnique, 'Must have UNIQUE(user_id, activity_id) constraint');
  });
});

// ---------------------------------------------------------------------------
// AC3 — ENABLE ROW LEVEL SECURITY
// ---------------------------------------------------------------------------
describe('Issue 405 — AC3: ENABLE ROW LEVEL SECURITY', () => {
  it('AC3: contains ENABLE ROW LEVEL SECURITY on public.wishlists', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(
      sql,
      /ALTER TABLE\s+public\.wishlists\s+ENABLE ROW LEVEL SECURITY/i,
      'Must ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY'
    );
  });
});

// ---------------------------------------------------------------------------
// AC4 — RLS policies (select_own, insert_own, delete_own, service_all)
// ---------------------------------------------------------------------------
describe('Issue 405 — AC4: RLS policies', () => {
  it('AC4: contains select_own policy using auth.uid()', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasSelect =
      /FOR\s+SELECT[\s\S]{0,500}auth\.uid\(\)/i.test(sql) ||
      /USING\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i.test(sql);
    assert.ok(hasSelect, 'Must have SELECT policy scoped to auth.uid()');
  });

  it('AC4: contains insert_own policy with WITH CHECK auth.uid()', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasInsert =
      /FOR\s+INSERT[\s\S]{0,500}WITH CHECK[\s\S]{0,200}auth\.uid\(\)/i.test(sql) ||
      /WITH CHECK\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i.test(sql);
    assert.ok(hasInsert, 'Must have INSERT policy with WITH CHECK (user_id = auth.uid())');
  });

  it('AC4: contains delete_own policy using auth.uid()', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasDelete =
      /FOR\s+DELETE[\s\S]{0,500}auth\.uid\(\)/i.test(sql);
    assert.ok(hasDelete, 'Must have DELETE policy scoped to auth.uid()');
  });

  it('AC4: contains service_all policy (USING (true) WITH CHECK (true))', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasService =
      /USING\s*\(\s*true\s*\)[\s\S]{0,100}WITH CHECK\s*\(\s*true\s*\)/i.test(sql) ||
      /service[\s\S]{0,200}USING\s*\(\s*true\s*\)/i.test(sql);
    assert.ok(hasService, 'Must have service_all policy USING (true) WITH CHECK (true)');
  });

  it('AC4: service_all policy is scoped TO service_role', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /TO\s+service_role/, 'service_all policy must be scoped TO service_role');
  });
});

// ---------------------------------------------------------------------------
// AC5 — schema cache reload
// ---------------------------------------------------------------------------
describe('Issue 405 — AC5: schema cache reload', () => {
  it('AC5: contains pg_notify or reload schema directive', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasReload =
      /pg_notify\s*\(\s*'pgrst'/i.test(sql) ||
      /reload\s+schema/i.test(sql);
    assert.ok(hasReload, "Must call pg_notify('pgrst', 'reload schema') for PostgREST cache refresh");
  });
});

// ---------------------------------------------------------------------------
// AC6 — rollback file
// ---------------------------------------------------------------------------
describe('Issue 405 — AC6: rollback file exists and is correct', () => {
  it('AC6: rollback file exists', () => {
    assert.ok(
      fs.existsSync(ROLLBACK_FILE),
      `Rollback file must exist: ${ROLLBACK_FILE}`
    );
  });

  it('AC6: rollback contains DROP TABLE IF EXISTS public.wishlists CASCADE', () => {
    const sql = fs.readFileSync(ROLLBACK_FILE, 'utf8');
    assert.match(
      sql,
      /DROP TABLE IF EXISTS\s+public\.wishlists/i,
      'Rollback must DROP TABLE IF EXISTS public.wishlists'
    );
  });
});

// ---------------------------------------------------------------------------
// AC7 — #431 FK repair migration: uuid type + FK constraint + schema reload
// ---------------------------------------------------------------------------
describe('Issue 431 — AC7: wishlists FK repair migration', () => {
  it('AC7: FK repair migration file exists', () => {
    assert.ok(
      fs.existsSync(FK_REPAIR_FILE),
      `FK repair migration must exist: ${FK_REPAIR_FILE}`
    );
  });

  it('AC7: repair migration casts activity_id to uuid', () => {
    const sql = fs.readFileSync(FK_REPAIR_FILE, 'utf8');
    assert.match(
      sql,
      /ALTER COLUMN\s+activity_id\s+TYPE\s+uuid/i,
      'Repair migration must ALTER COLUMN activity_id TYPE uuid'
    );
  });

  it('AC7: repair migration adds wishlists_activity_id_fkey FK constraint', () => {
    const sql = fs.readFileSync(FK_REPAIR_FILE, 'utf8');
    assert.match(
      sql,
      /wishlists_activity_id_fkey/i,
      'Repair migration must add wishlists_activity_id_fkey FK constraint'
    );
  });

  it('AC7: FK references public.activities(id) ON DELETE CASCADE', () => {
    const sql = fs.readFileSync(FK_REPAIR_FILE, 'utf8');
    assert.match(
      sql,
      /REFERENCES\s+public\.activities\s*\(\s*id\s*\)\s*ON DELETE CASCADE/i,
      'FK must REFERENCES public.activities(id) ON DELETE CASCADE'
    );
  });

  it('AC7: repair migration reloads PostgREST schema cache', () => {
    const sql = fs.readFileSync(FK_REPAIR_FILE, 'utf8');
    assert.match(
      sql,
      /pg_notify\s*\(\s*'pgrst'/i,
      "Repair migration must call pg_notify('pgrst', 'reload schema')"
    );
  });

  it('AC7: repair migration is idempotent (checks FK existence before adding)', () => {
    const sql = fs.readFileSync(FK_REPAIR_FILE, 'utf8');
    const hasIdempotentCheck =
      /wishlists_activity_id_fkey[\s\S]{0,300}NOT EXISTS/i.test(sql) ||
      /NOT EXISTS[\s\S]{0,300}wishlists_activity_id_fkey/i.test(sql);
    assert.ok(
      hasIdempotentCheck,
      'Repair migration must guard FK addition with NOT EXISTS check for idempotency'
    );
  });
});
