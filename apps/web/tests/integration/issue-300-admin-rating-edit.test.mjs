import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

// AC4: db.mjs updateActivityDb whitelist
test('AC4: updateActivityDb whitelist contains ratingAvg → rating_avg mapping', async () => {
  const src = await readSource('src/lib/db.mjs');
  assert.match(src, /ratingAvg[\s\S]{0,50}rating_avg/, 'updateActivityDb fields array should map ratingAvg to rating_avg');
});

test('AC4: updateActivityDb whitelist contains reviewCount → review_count mapping', async () => {
  const src = await readSource('src/lib/db.mjs');
  assert.match(src, /reviewCount[\s\S]{0,50}review_count/, 'updateActivityDb fields array should map reviewCount to review_count');
});

// Also verify listPublishedActivitiesDb returns activity-level rating not just guide rating
test('AC4: listPublishedActivitiesDb selects rating_avg from activities table (not only guide)', async () => {
  const src = await readSource('src/lib/db.mjs');
  // The activities select string in listPublishedActivitiesDb should include rating_avg
  // We look for rating_avg in the context of activities (before guide_profiles join)
  assert.match(src, /activities[\s\S]{0,500}rating_avg[\s\S]{0,200}review_count/, 'listPublishedActivitiesDb should select rating_avg, review_count from activities');
});

test('AC4: getActivityBySlugDb maps activity rating_avg to ratingAvg on return object', async () => {
  const src = await readSource('src/lib/db.mjs');
  // In the DB return mapping of getActivityBySlugDb, should map act.rating_avg
  assert.match(src, /act\.rating_avg/, 'getActivityBySlugDb return should map act.rating_avg');
});

test('AC4: getAdminActivityByIdDb selects rating_avg and review_count', async () => {
  const src = await readSource('src/lib/db.mjs');
  // The select in getAdminActivityByIdDb should include rating_avg
  assert.match(src, /getAdminActivityByIdDb[\s\S]{0,800}rating_avg/, 'getAdminActivityByIdDb select should include rating_avg');
});
