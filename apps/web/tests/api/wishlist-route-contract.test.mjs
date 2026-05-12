/**
 * Issue #305 - Wishlist (收藏活動) — RED contract tests
 *
 * Static-analysis style tests: read route source files and assert contracts.
 * No live DB required.
 *
 * AC1 - POST /api/me/wishlist adds wishlist entry
 * AC2 - Unauthenticated → 401 UNAUTHORIZED
 * AC3 - GET /api/me/wishlist lists entries; DELETE /api/me/wishlist/:activityId removes one
 * AC4 - RLS: user can only see/modify their own wishlist rows
 * AC5 - API routes: POST add, DELETE remove, GET list
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
const MIGRATION_FILE = path.join(MIGRATIONS_DIR, '20260511_issue305_wishlists.sql');

// ---------------------------------------------------------------------------
// Migration contract
// ---------------------------------------------------------------------------
describe('Issue 305 Wishlist — migration contract', () => {
  it('migration file exists', () => {
    assert.ok(fs.existsSync(MIGRATION_FILE), `Migration must exist: ${MIGRATION_FILE}`);
  });

  it('creates wishlists table with required columns', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    // Allow schema-qualified (public.wishlists) or unqualified
    const hasCreateTable = /CREATE TABLE\s+(IF NOT EXISTS\s+)?(public\.)?wishlists/i.test(sql);
    assert.ok(hasCreateTable, 'Must CREATE TABLE [public.]wishlists');
    assert.match(sql, /id\s+uuid/i, 'Must have id uuid PK');
    assert.match(sql, /user_id\s+uuid/i, 'Must have user_id uuid FK');
    assert.match(sql, /activity_id\s+uuid/i, 'Must have activity_id uuid FK');
    assert.match(sql, /added_at\s+timestamptz/i, 'Must have added_at timestamptz');
  });

  it('has unique constraint on (user_id, activity_id)', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasUnique = /UNIQUE\s*\(\s*user_id\s*,\s*activity_id\s*\)/i.test(sql)
      || /unique\s+\w*\s+on\s+wishlists\s*\(\s*user_id\s*,\s*activity_id\s*\)/i.test(sql)
      || /CONSTRAINT\s+\w+\s+UNIQUE\s*\(\s*user_id\s*,\s*activity_id\s*\)/i.test(sql);
    assert.ok(hasUnique, 'Must have UNIQUE(user_id, activity_id) to prevent duplicate wishlists');
  });

  it('AC4: enables RLS on wishlists table', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    // Allow schema-qualified or unqualified table name
    const hasRls = /ALTER TABLE\s+(public\.)?wishlists\s+ENABLE ROW LEVEL SECURITY/i.test(sql);
    assert.ok(hasRls, 'Must enable RLS on wishlists (ALTER TABLE [public.]wishlists ENABLE ROW LEVEL SECURITY)');
  });

  it('AC4: has SELECT policy scoped to auth.uid() = user_id', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasSelectPolicy = /CREATE POLICY[\s\S]{0,300}wishlists[\s\S]{0,300}FOR\s+SELECT[\s\S]{0,300}auth\.uid\(\)\s*=\s*user_id/i.test(sql)
      || /CREATE POLICY[\s\S]{0,300}wishlists[\s\S]{0,300}FOR\s+SELECT[\s\S]{0,300}user_id\s*=\s*auth\.uid\(\)/i.test(sql)
      || /USING\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i.test(sql);
    assert.ok(hasSelectPolicy,
      'Must have SELECT policy on wishlists: USING (user_id = auth.uid())');
  });

  it('AC4: has INSERT policy with WITH CHECK scoped to auth.uid() = user_id', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasInsertPolicy = /CREATE POLICY[\s\S]{0,300}wishlists[\s\S]{0,300}FOR\s+INSERT[\s\S]{0,300}WITH CHECK[\s\S]{0,300}auth\.uid\(\)/i.test(sql)
      || /WITH CHECK\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i.test(sql);
    assert.ok(hasInsertPolicy,
      'Must have INSERT policy on wishlists: WITH CHECK (user_id = auth.uid())');
  });

  it('AC4: has DELETE policy scoped to auth.uid() = user_id', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    const hasDeletePolicy = /CREATE POLICY[\s\S]{0,300}wishlists[\s\S]{0,300}FOR\s+DELETE[\s\S]{0,300}auth\.uid\(\)/i.test(sql)
      || /CREATE POLICY[\s\S]{0,300}wishlist[\s\S]{0,100}delete[\s\S]{0,300}auth\.uid\(\)/i.test(sql);
    assert.ok(hasDeletePolicy,
      'Must have DELETE policy on wishlists: USING (user_id = auth.uid())');
  });

  it('service role policy is scoped to TO service_role (no public-wide bypass)', () => {
    // Check the ensure-migration (issue #405) which fixes the service_all scoping
    const ensureFile = path.join(MIGRATIONS_DIR, '20260512_issue405_wishlists_ensure.sql');
    const sql = fs.readFileSync(ensureFile, 'utf8');
    const hasScopedServiceRolePolicy = /CREATE POLICY\s+"wishlists:\s*service role full access"[\s\S]{0,250}TO\s+service_role/i.test(sql);
    assert.ok(hasScopedServiceRolePolicy, 'Service role policy must be explicitly scoped TO service_role');
  });
});

// ---------------------------------------------------------------------------
// API Route contracts
// ---------------------------------------------------------------------------
describe('Issue 305 Wishlist — GET /api/me/wishlist route contract', () => {
  it('route file exists', () => {
    assert.ok(routeExists('app/api/me/wishlist/route.ts'),
      'app/api/me/wishlist/route.ts must exist');
  });

  it('AC3/AC5: exports GET function', () => {
    const src = readRoute('app/api/me/wishlist/route.ts');
    assert.match(src, /export\s+async\s+function\s+GET\s*\(/, 'Must export GET handler');
  });

  it('AC5: exports POST function', () => {
    const src = readRoute('app/api/me/wishlist/route.ts');
    assert.match(src, /export\s+async\s+function\s+POST\s*\(/, 'Must export POST handler');
  });

  it('AC2: GET checks authentication via supabase auth.getUser()', () => {
    const src = readRoute('app/api/me/wishlist/route.ts');
    assert.match(src, /auth\.getUser\(\)/, 'Must call auth.getUser()');
  });

  it('AC2: GET returns 401 UNAUTHORIZED when not logged in', () => {
    const src = readRoute('app/api/me/wishlist/route.ts');
    assert.match(src, /UNAUTHORIZED/, 'Must return UNAUTHORIZED error code');
    assert.match(src, /status:\s*401/, 'Must return HTTP 401 status');
  });

  it('AC1/AC5: POST adds to wishlist (via db helper or direct insert)', () => {
    const src = readRoute('app/api/me/wishlist/route.ts');
    // Route may use db helper (addToWishlistDb) or direct supabase insert
    const hasWishlistOp = /wishlists/.test(src)
      || /addToWishlistDb/.test(src)
      || /\.insert\(/.test(src);
    assert.ok(hasWishlistOp, 'POST must add to wishlist (use addToWishlistDb or .from(wishlists).insert)');
  });

  it('AC1: POST requires activityId in request body', () => {
    const src = readRoute('app/api/me/wishlist/route.ts');
    assert.match(src, /activityId/, 'Must reference activityId from request body');
  });

  it('GH-405: GET/POST surfaces backend schema errors as SERVER_ERROR (not silent success)', () => {
    const src = readRoute('app/api/me/wishlist/route.ts');
    assert.match(src, /fail\('SERVER_ERROR'/, 'GET/POST must map DB/schema errors to SERVER_ERROR response');
    assert.match(src, /status:\s*500/, 'SERVER_ERROR should return HTTP 500');
  });
});

describe('Issue 305 Wishlist — DELETE /api/me/wishlist/[activityId] route contract', () => {
  it('route file exists', () => {
    assert.ok(routeExists('app/api/me/wishlist/[activityId]/route.ts'),
      'app/api/me/wishlist/[activityId]/route.ts must exist');
  });

  it('AC3/AC5: exports DELETE function', () => {
    const src = readRoute('app/api/me/wishlist/[activityId]/route.ts');
    assert.match(src, /export\s+async\s+function\s+DELETE\s*\(/, 'Must export DELETE handler');
  });

  it('AC2: DELETE checks authentication', () => {
    const src = readRoute('app/api/me/wishlist/[activityId]/route.ts');
    assert.match(src, /auth\.getUser\(\)/, 'Must call auth.getUser()');
    assert.match(src, /UNAUTHORIZED/, 'Must return UNAUTHORIZED when not logged in');
  });

  it('AC3/AC5: DELETE removes from wishlists filtered by user and activity', () => {
    const src = readRoute('app/api/me/wishlist/[activityId]/route.ts');
    // Route may use db helper (removeFromWishlistDb) or direct supabase delete
    const hasDeleteOp = /wishlists/.test(src)
      || /removeFromWishlistDb/.test(src)
      || /\.delete\(\)/.test(src);
    assert.ok(hasDeleteOp, 'DELETE must remove from wishlist (use removeFromWishlistDb or .from(wishlists).delete)');
    // Must reference activityId for scoped deletion
    assert.match(src, /activityId/, 'Must reference activityId');
  });
});

// ---------------------------------------------------------------------------
// DB helper contract
// ---------------------------------------------------------------------------
describe('Issue 305 Wishlist — db.mjs wishlist helpers contract', () => {
  it('db.mjs exports addToWishlistDb', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/lib/db.mjs'), 'utf8');
    assert.match(src, /addToWishlistDb/, 'db.mjs must export addToWishlistDb');
  });

  it('db.mjs exports removeFromWishlistDb', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/lib/db.mjs'), 'utf8');
    assert.match(src, /removeFromWishlistDb/, 'db.mjs must export removeFromWishlistDb');
  });

  it('db.mjs exports listWishlistDb', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/lib/db.mjs'), 'utf8');
    assert.match(src, /listWishlistDb/, 'db.mjs must export listWishlistDb');
  });
});

// ---------------------------------------------------------------------------
// UI contract
// ---------------------------------------------------------------------------
describe('Issue 305 Wishlist — /me/wishlist page contract', () => {
  it('/me/wishlist page file exists', () => {
    const pageExists = routeExists('app/me/wishlist/page.tsx')
      || routeExists('app/(me)/wishlist/page.tsx');
    assert.ok(pageExists, 'Must have a /me/wishlist page at app/me/wishlist/page.tsx');
  });

  it('/me/wishlist page references wishlist API route', () => {
    const pagePath = routeExists('app/me/wishlist/page.tsx')
      ? 'app/me/wishlist/page.tsx'
      : 'app/(me)/wishlist/page.tsx';
    const src = readRoute(pagePath);
    const hasApiRef = /\/api\/me\/wishlist/.test(src)
      || /listWishlistDb/.test(src)
      || /wishlist/.test(src);
    assert.ok(hasApiRef, 'Wishlist page must reference the wishlist API or DB helper');
  });

  it('wishlist page has remove button or functionality', () => {
    const pagePath = routeExists('app/me/wishlist/page.tsx')
      ? 'app/me/wishlist/page.tsx'
      : 'app/(me)/wishlist/page.tsx';
    const src = readRoute(pagePath);
    const hasRemove = /remove|delete|DELETE|取消|移除/i.test(src);
    assert.ok(hasRemove, 'Wishlist page must have remove functionality');
  });
});

describe('Issue 305 Wishlist — activity detail heart toggle contract', () => {
  it('WishlistToggle component file exists', () => {
    const exists = routeExists('src/components/WishlistToggle.tsx')
      || routeExists('app/activities/[slug]/WishlistToggle.tsx')
      || routeExists('src/components/wishlist-toggle.tsx');
    assert.ok(exists,
      'Must have WishlistToggle component at src/components/WishlistToggle.tsx');
  });

  it('WishlistToggle calls POST /api/me/wishlist or DELETE /api/me/wishlist/:id', () => {
    let src = '';
    if (routeExists('src/components/WishlistToggle.tsx')) {
      src = readRoute('src/components/WishlistToggle.tsx');
    } else if (routeExists('src/components/wishlist-toggle.tsx')) {
      src = readRoute('src/components/wishlist-toggle.tsx');
    } else {
      src = readRoute('app/activities/[slug]/WishlistToggle.tsx');
    }
    const hasApiCall = /\/api\/me\/wishlist/.test(src);
    assert.ok(hasApiCall, 'WishlistToggle must call /api/me/wishlist endpoint');
  });
});
