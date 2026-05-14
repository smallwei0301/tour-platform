import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

const GUIDE_ROUTE = path.join(WEB_ROOT, 'app/api/guide/activities-with-plans/route.ts');
const ACTIVITIES_ROUTE = path.join(WEB_ROOT, 'app/api/activities/route.ts');
const DB_LIB = path.join(WEB_ROOT, 'src/lib/db.mjs');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

describe('Issue #502 query contract', () => {
  it('guide activities-with-plans route must use status-based activity filtering only', () => {
    const src = read(GUIDE_ROUTE);
    assert.ok(!src.includes('activities.is_active'), 'must not reference activities.is_active');
    assert.match(src, /\.in\('activities\.status',\s*\['active',\s*'published'\]\)/, 'must filter activities.status in active/published');
  });

  it('public activities route still delegates to listPublishedActivitiesDb', () => {
    const src = read(ACTIVITIES_ROUTE);
    assert.match(src, /listPublishedActivitiesDb\(\{\s*region,\s*category,\s*q\s*\}\)/);
  });

  it('listPublishedActivitiesDb must avoid hard-binding embed constraint name activities_guide_id_fkey', () => {
    const src = read(DB_LIB);
    const start = src.indexOf('export async function listPublishedActivitiesDb(filters = {}) {');
    const end = src.indexOf('async function getFixtureActivityBySlug', start);
    assert.notEqual(start, -1, 'listPublishedActivitiesDb must exist');
    assert.notEqual(end, -1, 'next function boundary must exist');
    const fnBody = src.slice(start, end);
    assert.ok(!fnBody.includes('guide_profiles!activities_guide_id_fkey('), 'must not use hard-coded activities_guide_id_fkey embed in list query');
    assert.match(fnBody, /\.from\('guide_profiles'\)[\s\S]*\.in\('id',\s*guideIds\)/, 'must load guide profiles by guide_ids in a separate query');
  });
});
