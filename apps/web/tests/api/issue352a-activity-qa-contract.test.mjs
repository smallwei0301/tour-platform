/**
 * Issue #361 - activity_qa backend: migration + RLS + traveler submit + admin CRUD
 * RED contract tests (static-analysis style, no live DB)
 *
 * AC1 — migration creates activity_qa table with correct schema + index
 * AC2 — migration adds 3 RLS policies (public_read_approved_qa, authenticated_insert_pending_qa, service_role_all_qa)
 * AC3 — POST /api/qa: auth required, question validation, pending_moderation status
 * AC4 — GET /api/admin/qa: isAdminAuthorized check + ?status filter + created_at DESC
 * AC5 — PATCH /api/admin/qa/[id]: isAdminAuthorized + answer + approved/rejected status
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function readRoute(relPath) {
  const full = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(full), `Route file must exist: ${full}`);
  return fs.readFileSync(full, 'utf8');
}

function routeExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

const MIGRATIONS_DIR = path.resolve(ROOT, '../../supabase/migrations');
const MIGRATION_FILE = path.join(MIGRATIONS_DIR, '20260511_issue352a_activity_qa.sql');

// ---------------------------------------------------------------------------
// AC1 — Migration: CREATE TABLE activity_qa with correct schema + index
// ---------------------------------------------------------------------------
describe('Issue 361 — AC1: migration creates activity_qa table', () => {
  it('AC1: migration file exists', () => {
    assert.ok(fs.existsSync(MIGRATION_FILE), `Migration must exist: ${MIGRATION_FILE}`);
  });

  it('AC1: creates activity_qa table with IF NOT EXISTS', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+(public\.)?activity_qa/i,
      'Must CREATE TABLE IF NOT EXISTS activity_qa');
  });

  it('AC1: id uuid PRIMARY KEY DEFAULT gen_random_uuid()', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /id\s+uuid\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i,
      'Must have id uuid PRIMARY KEY DEFAULT gen_random_uuid()');
  });

  it('AC1: activity_id text NOT NULL column', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /activity_id\s+text\s+NOT\s+NULL/i,
      'Must have activity_id text NOT NULL');
  });

  it('AC1: user_id uuid column (nullable)', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /user_id\s+uuid/i, 'Must have user_id uuid column');
  });

  it('AC1: question text NOT NULL column', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /question\s+text\s+NOT\s+NULL/i,
      'Must have question text NOT NULL');
  });

  it('AC1: answer text column (nullable)', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /answer\s+text/i, 'Must have answer text column');
  });

  it('AC1: status text NOT NULL DEFAULT pending_moderation with CHECK', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /status\s+text\s+NOT\s+NULL\s+DEFAULT\s+'pending_moderation'/i,
      "Must have status NOT NULL DEFAULT 'pending_moderation'");
    assert.match(sql, /CHECK\s*\(\s*status\s+IN\s*\(/i, 'Must have CHECK constraint on status');
    assert.match(sql, /approved/i, "CHECK constraint must include 'approved'");
    assert.match(sql, /rejected/i, "CHECK constraint must include 'rejected'");
    assert.match(sql, /pending_moderation/i, "CHECK constraint must include 'pending_moderation'");
  });

  it('AC1: created_at timestamptz DEFAULT now()', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /created_at\s+timestamptz\s+DEFAULT\s+now\(\)/i,
      'Must have created_at timestamptz DEFAULT now()');
  });

  it('AC1: index on (activity_id, status)', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /CREATE INDEX IF NOT EXISTS.*activity_qa.*activity_id.*status/is,
      'Must create index on (activity_id, status)');
  });

  it('AC1: rollback drops activity_qa table', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /DROP TABLE IF EXISTS\s+(public\.)?activity_qa\s+CASCADE/i,
      'Must have rollback: DROP TABLE IF EXISTS activity_qa CASCADE');
  });
});

// ---------------------------------------------------------------------------
// AC2 — Migration: 3 RLS policies with idempotent DO $$ guards
// ---------------------------------------------------------------------------
describe('Issue 361 — AC2: migration adds 3 RLS policies', () => {
  it('AC2: enables RLS on activity_qa', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /ALTER TABLE\s+(public\.)?activity_qa\s+ENABLE ROW LEVEL SECURITY/i,
      'Must ENABLE ROW LEVEL SECURITY on activity_qa');
  });

  it('AC2: uses idempotent DO $$ guards', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /DO\s+\$\$/i, 'Must use DO $$ block for idempotent policy creation');
  });

  it('AC2: creates public_read_approved_qa policy FOR SELECT USING status=approved', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /public_read_approved_qa/i,
      "Must create 'public_read_approved_qa' policy");
    assert.match(sql, /status\s*=\s*'approved'/i,
      "Policy must USING (status = 'approved')");
  });

  it('AC2: creates authenticated_insert_pending_qa policy FOR INSERT TO authenticated', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /authenticated_insert_pending_qa/i,
      "Must create 'authenticated_insert_pending_qa' policy");
    assert.match(sql, /FOR\s+INSERT\s+TO\s+authenticated/i,
      'Policy must be FOR INSERT TO authenticated');
    assert.match(sql, /auth\.uid\(\)\s*=\s*user_id/i,
      'Policy WITH CHECK must include auth.uid() = user_id');
  });

  it('AC2: creates service_role_all_qa policy', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /service_role_all_qa/i,
      "Must create 'service_role_all_qa' policy");
  });
});

// ---------------------------------------------------------------------------
// AC3 — POST /api/qa: auth required, question validation, pending_moderation
// ---------------------------------------------------------------------------
describe('Issue 361 — AC3: POST /api/qa submit route', () => {
  it('AC3: route file exists at app/api/qa/route.ts', () => {
    assert.ok(routeExists('app/api/qa/route.ts'),
      'app/api/qa/route.ts must exist');
  });

  it('AC3: exports POST function', () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(src, /export\s+async\s+function\s+POST\s*\(/, 'Must export POST handler');
  });

  it('AC3: checks auth via getUser() and returns 401 if no user', () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(src, /auth\.getUser\(\)/, 'Must call auth.getUser()');
    assert.match(src, /UNAUTHORIZED/i, 'Must return UNAUTHORIZED error code');
    assert.match(src, /status:\s*401/, 'Must return HTTP 401 status');
  });

  it('AC3: returns 400 if question is empty', () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(src, /question/, 'Must validate question field');
    assert.match(src, /status:\s*400/, 'Must return HTTP 400 for invalid input');
  });

  it('AC3: inserts with status pending_moderation', () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(src, /status:\s*['"]pending_moderation['"]/i,
      "Must insert with status: 'pending_moderation'");
  });

  it('AC3: accepts activityId and question from body', () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(src, /activityId/, 'Must accept activityId');
    assert.match(src, /question/, 'Must accept question');
  });

  it('AC3: returns 201 on success', () => {
    const src = readRoute('app/api/qa/route.ts');
    assert.match(src, /status:\s*201/, 'Must return HTTP 201 on success');
  });
});

// ---------------------------------------------------------------------------
// AC4 — GET /api/admin/qa: admin auth + status filter + ordering
// ---------------------------------------------------------------------------
describe('Issue 361 — AC4: GET /api/admin/qa route', () => {
  it('AC4: route file exists at app/api/admin/qa/route.ts', () => {
    assert.ok(routeExists('app/api/admin/qa/route.ts'),
      'app/api/admin/qa/route.ts must exist');
  });

  it('AC4: exports GET function', () => {
    const src = readRoute('app/api/admin/qa/route.ts');
    assert.match(src, /export\s+async\s+function\s+GET\s*\(/, 'Must export GET handler');
  });

  it('AC4: imports or calls isAdminAuthorized', () => {
    const src = readRoute('app/api/admin/qa/route.ts');
    assert.match(src, /isAdminAuthorized/, 'Must use isAdminAuthorized for admin auth');
  });

  it('AC4: returns 401 when not authorized', () => {
    const src = readRoute('app/api/admin/qa/route.ts');
    assert.match(src, /status:\s*401/, 'Must return HTTP 401 when unauthorized');
    assert.match(src, /UNAUTHORIZED/i, 'Must return UNAUTHORIZED error code');
  });

  it('AC4: supports ?status= query param filter', () => {
    const src = readRoute('app/api/admin/qa/route.ts');
    assert.match(src, /status/, 'Must support ?status= query filter');
    assert.match(src, /searchParams|url\.search/i, 'Must read status from URL searchParams');
  });

  it('AC4: orders by created_at DESC', () => {
    const src = readRoute('app/api/admin/qa/route.ts');
    assert.match(src, /created_at/, 'Must order by created_at');
    assert.match(src, /desc|DESC/, 'Must order descending');
  });

  it('AC4: queries activity_qa table', () => {
    const src = readRoute('app/api/admin/qa/route.ts');
    assert.match(src, /activity_qa/, 'Must query activity_qa table');
  });
});

// ---------------------------------------------------------------------------
// AC5 — PATCH /api/admin/qa/[id]: admin auth + answer + status
// ---------------------------------------------------------------------------
describe('Issue 361 — AC5: PATCH /api/admin/qa/[id] route', () => {
  it('AC5: route file exists at app/api/admin/qa/[id]/route.ts', () => {
    assert.ok(routeExists('app/api/admin/qa/[id]/route.ts'),
      'app/api/admin/qa/[id]/route.ts must exist');
  });

  it('AC5: exports PATCH function', () => {
    const src = readRoute('app/api/admin/qa/[id]/route.ts');
    assert.match(src, /export\s+async\s+function\s+PATCH\s*\(/, 'Must export PATCH handler');
  });

  it('AC5: checks isAdminAuthorized → 401', () => {
    const src = readRoute('app/api/admin/qa/[id]/route.ts');
    assert.match(src, /isAdminAuthorized/, 'Must use isAdminAuthorized');
    assert.match(src, /status:\s*401/, 'Must return 401 when unauthorized');
  });

  it('AC5: accepts answer field in request body', () => {
    const src = readRoute('app/api/admin/qa/[id]/route.ts');
    assert.match(src, /answer/, 'Must accept answer field');
  });

  it('AC5: accepts status approved or rejected', () => {
    const src = readRoute('app/api/admin/qa/[id]/route.ts');
    assert.match(src, /approved/, "Must accept status 'approved'");
    assert.match(src, /rejected/, "Must accept status 'rejected'");
  });

  it('AC5: validates status in approved/rejected', () => {
    const src = readRoute('app/api/admin/qa/[id]/route.ts');
    assert.match(src, /INVALID_STATUS|status must be/i, 'Must validate status and return error for invalid');
  });

  it('AC5: updates activity_qa table', () => {
    const src = readRoute('app/api/admin/qa/[id]/route.ts');
    assert.match(src, /activity_qa/, 'Must update activity_qa table');
  });
});
