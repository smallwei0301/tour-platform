/**
 * Issue #322: Backward compat — image_urls jsonb field coexistence with activity_images table
 * Static analysis of migration SQL + API route source — no live DB required.
 *
 * AC6 - Old read path (/api/activities/[slug]/route.ts) still reads from image_urls jsonb
 *        (not from activity_images table) — no regression introduced.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../supabase/migrations');
const FORWARD_FILE = path.join(MIGRATIONS_DIR, '20260511_issue322_guide_activity_authoring.sql');

// Path to the read route for activities
const ACTIVITY_SLUG_ROUTE = path.resolve(
  __dirname,
  '../../../../app/api/activities/[slug]/route.ts'
);

// Path to the DB lib
const DB_LIB = path.resolve(__dirname, '../../../../src/lib/db.mjs');

function readFile(filePath) {
  assert.ok(fs.existsSync(filePath), `File must exist: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

describe('Issue 322 backward compat — jsonb coexistence (AC6)', () => {
  it('migration does NOT drop image_urls column from activities', () => {
    const sql = readFile(FORWARD_FILE);
    // Must not contain DROP COLUMN image_urls in the forward migration
    const dropsImageUrls = /DROP COLUMN\s+(IF EXISTS\s+)?image_urls/i.test(sql);
    assert.equal(dropsImageUrls, false,
      'Forward migration must NOT drop image_urls column (backward compat)');
  });

  it('migration does NOT modify image_urls column type', () => {
    const sql = readFile(FORWARD_FILE);
    // Must not contain ALTER COLUMN image_urls
    const altersImageUrls = /ALTER COLUMN\s+image_urls/i.test(sql);
    assert.equal(altersImageUrls, false,
      'Forward migration must NOT alter image_urls column (backward compat)');
  });

  it('AC6: activities[slug] route still uses getActivityBySlugDb (reads from jsonb path)', () => {
    const routeSrc = readFile(ACTIVITY_SLUG_ROUTE);
    assert.match(routeSrc, /getActivityBySlugDb/,
      'Route must still call getActivityBySlugDb (which reads from image_urls jsonb)');
  });

  it('AC6: getActivityBySlugDb still selects image_urls from activities table', () => {
    const dbSrc = readFile(DB_LIB);
    assert.match(dbSrc, /image_urls/,
      'db.mjs must still reference image_urls (jsonb field on activities table)');
  });

  it('AC6: db.mjs does NOT join activity_images table in getActivityBySlugDb', () => {
    const dbSrc = readFile(DB_LIB);
    // The getActivityBySlugDb function should not select from activity_images table
    // We check by looking at the select block after 'getActivityBySlugDb'
    const fnIdx = dbSrc.indexOf('getActivityBySlugDb');
    assert.ok(fnIdx !== -1, 'getActivityBySlugDb must exist in db.mjs');
    // Extract up to next 3000 chars of this function
    const fnChunk = dbSrc.slice(fnIdx, fnIdx + 3000);
    // Should not have a join to activity_images TABLE (the new normalized table)
    // Note: the storage bucket is named 'activity-images' (with hyphen) - that's different
    const joinsActivityImagesTable = /activity_images!|from\s*\(\s*select[\s\S]{0,200}activity_images/i.test(fnChunk);
    assert.equal(joinsActivityImagesTable, false,
      'getActivityBySlugDb must NOT join activity_images table (old path reads jsonb only)');
  });

  it('activity_images table creation does not break existing image_urls jsonb column', () => {
    // The new activity_images TABLE (normalized rows) is separate from image_urls jsonb
    // Verify the migration creates the TABLE (new) and does not touch the column (old)
    const sql = readFile(FORWARD_FILE);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS\s+(public\.)?activity_images/i,
      'Forward migration must create activity_images TABLE');
    const dropsOldColumn = /DROP COLUMN\s+(IF EXISTS\s+)?image_urls/i.test(sql);
    assert.equal(dropsOldColumn, false,
      'Forward migration must NOT drop old image_urls jsonb column');
  });
});
