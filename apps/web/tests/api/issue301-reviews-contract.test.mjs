/**
 * Issue #359 - Reviews backend: moderation migration + submit API + admin approve
 * RED contract tests (static-analysis style, no live DB)
 *
 * AC1 — migration adds status, booking_id, user_id columns + backfills seed reviews
 * AC2 — migration tightens RLS: public_read_approved_reviews with status='approved'
 * AC3 — POST /api/reviews: auth, validation, idempotency (409), pending status
 * AC4 — GET /api/admin/reviews: isAdminAuthorized check + ?status filter
 * AC5 — PATCH /api/admin/reviews/[id]: isAdminAuthorized + approve/reject + rating recompute
 * AC6 — db.mjs activity_reviews query filters .eq('status', 'approved')
 * AC7 — POST /api/reviews verifies booking ownership before inserting
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
const MIGRATION_FILE = path.join(MIGRATIONS_DIR, '20260511_issue359_reviews_moderation.sql');
const ROLLBACK_FILE = path.join(MIGRATIONS_DIR, '20260511_issue359_reviews_moderation.rollback.sql');

// ---------------------------------------------------------------------------
// AC1 — Migration: additive columns + backfill
// ---------------------------------------------------------------------------
describe('Issue 359 — AC1: migration adds moderation columns + backfills', () => {
  it('migration file exists', () => {
    assert.ok(fs.existsSync(MIGRATION_FILE), `Migration must exist: ${MIGRATION_FILE}`);
  });

  it('AC1: adds status column with NOT NULL DEFAULT pending + CHECK constraint', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS\s+status\s+text/i,
      'Must ADD COLUMN IF NOT EXISTS status text');
    assert.match(sql, /DEFAULT\s+'pending'/i, "Must DEFAULT 'pending'");
    assert.match(sql, /CHECK\s*\(\s*status\s+IN\s*\(/i, 'Must have CHECK constraint');
    assert.match(sql, /approved/i, "CHECK constraint must include 'approved'");
    assert.match(sql, /rejected/i, "CHECK constraint must include 'rejected'");
  });

  it('AC1: adds booking_id uuid column', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS\s+booking_id\s+uuid/i,
      'Must ADD COLUMN IF NOT EXISTS booking_id uuid');
  });

  it('AC1: adds user_id uuid column', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS\s+user_id\s+uuid/i,
      'Must ADD COLUMN IF NOT EXISTS user_id uuid');
  });

  it('AC1: backfills seed reviews: UPDATE SET status=approved WHERE is_verified', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /UPDATE\s+(public\.)?activity_reviews\s+SET\s+status\s*=\s*'approved'/i,
      "Must UPDATE activity_reviews SET status = 'approved'");
    assert.match(sql, /is_verified/i, 'Backfill must reference is_verified');
  });

  it('AC1: creates index on (activity_slug, status)', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /CREATE INDEX IF NOT EXISTS.*activity_reviews.*activity_slug.*status/is,
      'Must create index on (activity_slug, status)');
  });

  it('AC1: rollback file exists', () => {
    assert.ok(fs.existsSync(ROLLBACK_FILE), `Rollback file must exist: ${ROLLBACK_FILE}`);
  });

  it('AC1: rollback drops added columns', () => {
    const sql = fs.readFileSync(ROLLBACK_FILE, 'utf8');
    assert.match(sql, /DROP COLUMN IF EXISTS\s+status/i, 'Rollback must drop status column');
    assert.match(sql, /DROP COLUMN IF EXISTS\s+booking_id/i, 'Rollback must drop booking_id column');
    assert.match(sql, /DROP COLUMN IF EXISTS\s+user_id/i, 'Rollback must drop user_id column');
  });
});

// ---------------------------------------------------------------------------
// AC2 — Migration: RLS tightened to approved only
// ---------------------------------------------------------------------------
describe('Issue 359 — AC2: migration tightens RLS to approved reviews', () => {
  it('AC2: migration drops old public_read_reviews policy', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /public_read_reviews/i, "Migration must reference old policy 'public_read_reviews'");
    assert.match(sql, /DROP POLICY/i, 'Migration must DROP old policy');
  });

  it('AC2: migration creates public_read_approved_reviews policy with status=approved', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /public_read_approved_reviews/i, "Must create 'public_read_approved_reviews' policy");
    assert.match(sql, /status\s*=\s*'approved'/i, "Policy must USING (status = 'approved')");
  });

  it('AC2: uses idempotent DO $$ guard for policy creation', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /DO\s+\$\$/i, 'Must use DO $$ block for idempotent policy');
  });
});

// ---------------------------------------------------------------------------
// AC3 — POST /api/reviews: auth, validation, idempotency, pending
// ---------------------------------------------------------------------------
describe('Issue 359 — AC3: POST /api/reviews submit route', () => {
  it('AC3: route file exists at app/api/reviews/route.ts', () => {
    assert.ok(routeExists('app/api/reviews/route.ts'),
      'app/api/reviews/route.ts must exist');
  });

  it('AC3: exports POST function', () => {
    const src = readRoute('app/api/reviews/route.ts');
    assert.match(src, /export\s+async\s+function\s+POST\s*\(/, 'Must export POST handler');
  });

  it('AC3: checks auth via server-session getUser() and returns 401 if no user', () => {
    const src = readRoute('app/api/reviews/route.ts');
    assert.match(src, /from ['"]\.\.\/\.\.\/\.\.\/src\/lib\/supabase\/server['"]/, 'Must import server-side Supabase client for cookie session auth');
    assert.match(src, /const\s+supabase\s*=\s*await\s+createClient\(\)/, 'Must create cookie-bound server Supabase client');
    assert.match(src, /auth\.getUser\(\)/, 'Must call auth.getUser()');
    assert.doesNotMatch(src, /headers\.get\(['"]authorization['"]\)/i, 'Must not require Authorization header for browser session flow');
    assert.match(src, /UNAUTHORIZED/i, 'Must return UNAUTHORIZED error code');
    assert.match(src, /status:\s*401/, 'Must return HTTP 401 status');
  });

  it('AC3: accepts activityId, bookingId, rating, reviewText from body', () => {
    const src = readRoute('app/api/reviews/route.ts');
    assert.match(src, /activityId/, 'Must accept activityId');
    assert.match(src, /bookingId/, 'Must accept bookingId');
    assert.match(src, /rating/, 'Must accept rating');
    assert.match(src, /reviewText/, 'Must accept reviewText');
  });

  it('AC3: returns 409 if review already exists (idempotency)', () => {
    const src = readRoute('app/api/reviews/route.ts');
    assert.match(src, /409/, 'Must return HTTP 409 for duplicate review');
    assert.match(src, /ALREADY_REVIEWED|already/i, 'Must return already-reviewed error');
  });

  it('AC3: inserts review with status pending', () => {
    const src = readRoute('app/api/reviews/route.ts');
    assert.match(src, /status:\s*['"]pending['"]/i, "Must insert review with status: 'pending'");
  });

  it('AC3: inserts review with non-null text id for activity_reviews.id contract', () => {
    const src = readRoute('app/api/reviews/route.ts');
    assert.match(
      src,
      /\.insert\(\s*\{[\s\S]*\bid\s*:\s*[^,}\n]+/m,
      'Must include id in activity_reviews insert payload'
    );
  });

  it('AC3: returns 201 on success', () => {
    const src = readRoute('app/api/reviews/route.ts');
    assert.match(src, /status:\s*201/, 'Must return HTTP 201 on success');
  });
});

// ---------------------------------------------------------------------------
// AC4 — GET /api/admin/reviews: admin auth + status filter
// ---------------------------------------------------------------------------
describe('Issue 359 — AC4: GET /api/admin/reviews route', () => {
  it('AC4: route file exists at app/api/admin/reviews/route.ts', () => {
    assert.ok(routeExists('app/api/admin/reviews/route.ts'),
      'app/api/admin/reviews/route.ts must exist');
  });

  it('AC4: exports GET function', () => {
    const src = readRoute('app/api/admin/reviews/route.ts');
    assert.match(src, /export\s+async\s+function\s+GET\s*\(/, 'Must export GET handler');
  });

  it('AC4: imports or calls isAdminAuthorized', () => {
    const src = readRoute('app/api/admin/reviews/route.ts');
    assert.match(src, /isAdminAuthorized/, 'Must use isAdminAuthorized for admin auth');
  });

  it('AC4: returns 401 when not authorized', () => {
    const src = readRoute('app/api/admin/reviews/route.ts');
    assert.match(src, /status:\s*401/, 'Must return HTTP 401 when unauthorized');
    assert.match(src, /UNAUTHORIZED/i, 'Must return UNAUTHORIZED error code');
  });

  it('AC4: supports ?status= query param filter', () => {
    const src = readRoute('app/api/admin/reviews/route.ts');
    assert.match(src, /status/, 'Must support ?status= query filter');
    assert.match(src, /searchParams|url\.search/i, 'Must read status from URL searchParams');
  });

  it('AC4: orders by created_at DESC', () => {
    const src = readRoute('app/api/admin/reviews/route.ts');
    assert.match(src, /created_at/, 'Must order by created_at');
    assert.match(src, /desc|DESC/, 'Must order descending');
  });
});

// ---------------------------------------------------------------------------
// AC5 — PATCH /api/admin/reviews/[id]: approve/reject + rating recompute
// ---------------------------------------------------------------------------
describe('Issue 359 — AC5: PATCH /api/admin/reviews/[id] route', () => {
  it('AC5: route file exists at app/api/admin/reviews/[id]/route.ts', () => {
    assert.ok(routeExists('app/api/admin/reviews/[id]/route.ts'),
      'app/api/admin/reviews/[id]/route.ts must exist');
  });

  it('AC5: exports PATCH function', () => {
    const src = readRoute('app/api/admin/reviews/[id]/route.ts');
    assert.match(src, /export\s+async\s+function\s+PATCH\s*\(/, 'Must export PATCH handler');
  });

  it('AC5: checks isAdminAuthorized → 401', () => {
    const src = readRoute('app/api/admin/reviews/[id]/route.ts');
    assert.match(src, /isAdminAuthorized/, 'Must use isAdminAuthorized');
    assert.match(src, /status:\s*401/, 'Must return 401 when unauthorized');
  });

  it('AC5: accepts status approved or rejected', () => {
    const src = readRoute('app/api/admin/reviews/[id]/route.ts');
    assert.match(src, /approved/, "Must accept status 'approved'");
    assert.match(src, /rejected/, "Must accept status 'rejected'");
  });

  it('AC5: on approve, recomputes rating_avg', () => {
    const src = readRoute('app/api/admin/reviews/[id]/route.ts');
    assert.match(src, /rating_avg/, 'Must update rating_avg on approve');
  });

  it('AC5: on approve, recomputes review_count', () => {
    const src = readRoute('app/api/admin/reviews/[id]/route.ts');
    assert.match(src, /review_count/, 'Must update review_count on approve');
  });

  it('AC5: updates activities table with recomputed stats', () => {
    const src = readRoute('app/api/admin/reviews/[id]/route.ts');
    assert.match(src, /activities/, 'Must update activities table');
  });
});

// ---------------------------------------------------------------------------
// AC6 — db.mjs: activity_reviews query filters by status=approved
// ---------------------------------------------------------------------------
describe('Issue 359 — AC6: db.mjs activity_reviews query filters approved only', () => {
  it('AC6: db.mjs activity_reviews query contains .eq("status", "approved")', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/lib/db.mjs'), 'utf8');
    const hasFilter = /\.eq\(\s*['"]status['"]\s*,\s*['"]approved['"]\s*\)/.test(src);
    assert.ok(hasFilter, 'db.mjs activity_reviews query must filter .eq(\'status\', \'approved\')');
  });
});

// ---------------------------------------------------------------------------
// AC7 — POST /api/reviews: verifies booking ownership before inserting
// ---------------------------------------------------------------------------
describe('Issue 359 — AC7: POST /api/reviews verifies booking ownership', () => {
  it('AC7: route queries bookings table to verify ownership', () => {
    const src = readRoute('app/api/reviews/route.ts');
    assert.match(src, /bookings/, 'Must query bookings table to verify ownership');
  });

  // #1379: ownership 判斷集中到 src/lib/review-ownership.mjs 的
  // evaluateReviewSubmission（route 改為單一守門呼叫）。原先鎖在 route 原始碼上的
  // bookingOwned / !booking-fallback 形狀改鎖 helper 原始碼；行為面由
  // review-ownership-auth.behavior.test.mjs 與 issue1379-traveler-review-submit.test.mjs 覆蓋。
  it('AC7: uses bookings.traveler_id ownership contract, with orders.user_id fallback for legacy orderId payload', () => {
    const src = readRoute('app/api/reviews/route.ts');
    assert.match(
      src,
      /\.from\('bookings'\)[\s\S]*\.select\(\s*['"]id,\s*traveler_id,\s*status['"]\s*\)/,
      'Must query bookings with traveler_id ownership fields'
    );
    assert.match(
      src,
      /\.from\('orders'\)[\s\S]*\.select\(\s*['"]id,\s*user_id,\s*status['"]\s*\)/,
      'Must support orders ownership fallback using orders.user_id'
    );
    assert.match(src, /if \(!booking\)/, 'Must use fallback order lookup only when booking lookup failed');
    assert.match(src, /evaluateReviewSubmission\(/, 'Route must gate via evaluateReviewSubmission');
    assert.doesNotMatch(
      src,
      /\.from\('orders'\)[\s\S]*\.select\(\s*['"]id,\s*user_id,\s*status,\s*traveler_id|traveler_id\s*\]/,
      'Fallback must not reference orders.traveler_id'
    );
  });

  it('AC7: helper forbids non-owned existing booking even when fallback order belongs to another traveler', () => {
    const helperSrc = readRoute('src/lib/review-ownership.mjs');
    assert.match(
      helperSrc,
      /bookingOwned:\s*booking\s*\?\s*booking\.traveler_id === userId\s*:\s*false/,
      'Primary booking owner check must use traveler_id'
    );
    assert.match(
      helperSrc,
      /orderOwned:\s*!booking && order\s*\?\s*order\.user_id === userId\s*:\s*false/,
      'Fallback gate must be coupled with !booking'
    );
  });

  it('AC7: returns 403 FORBIDDEN if booking not owned by user', () => {
    const helperSrc = readRoute('src/lib/review-ownership.mjs');
    assert.match(helperSrc, /FORBIDDEN/, 'Helper must return FORBIDDEN if booking not owned');
    assert.match(helperSrc, /status:\s*403/, 'Must return HTTP 403');
    const routeSrc = readRoute('app/api/reviews/route.ts');
    assert.match(routeSrc, /\{\s*status:\s*verdict\.status\s*\}/, 'Route must propagate verdict status');
  });
});
