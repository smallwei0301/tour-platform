import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

// AC1: ActivitiesContent.tsx listing card
test('AC1: ActivitiesContent listing card shows activity ratingAvg.toFixed(1)', async () => {
  const src = await readSource('app/activities/ActivitiesContent.tsx');
  assert.match(src, /ratingAvg\.toFixed\(1\)/, 'Should format ratingAvg with toFixed(1)');
});

test('AC1: ActivitiesContent listing card shows reviewCount', async () => {
  const src = await readSource('app/activities/ActivitiesContent.tsx');
  assert.match(src, /reviewCount/, 'Should render reviewCount');
});

test('AC1: ActivitiesContent listing card shows 尚無評價 for null rating', async () => {
  const src = await readSource('app/activities/ActivitiesContent.tsx');
  assert.match(src, /尚無評價/, 'Should show 尚無評價 fallback when rating is null');
});

test('AC1: ActivitiesContent listing card has data-testid="activity-card-rating"', async () => {
  const src = await readSource('app/activities/ActivitiesContent.tsx');
  assert.match(src, /data-testid="activity-card-rating"/, 'Should have activity-card-rating testid');
});

// AC2: detail page
test('AC2: detail page uses activity ratingAvg (not guide?.ratingAvg) for headline', async () => {
  const src = await readSource('app/activities/[region]/[slug]/page.tsx');
  // activityData is a cast of activity with ratingAvg; both patterns are valid
  assert.match(src, /activityData\.ratingAvg|activity\.ratingAvg/, 'Should use activity-sourced ratingAvg for headline rating');
});

test('AC2: detail page uses activity reviewCount', async () => {
  const src = await readSource('app/activities/[region]/[slug]/page.tsx');
  assert.match(src, /activityData\.reviewCount|activity\.reviewCount/, 'Should use activity reviewCount');
});

test('AC2: detail page has data-testid="activity-detail-rating"', async () => {
  const src = await readSource('app/activities/[region]/[slug]/page.tsx');
  assert.match(src, /data-testid="activity-detail-rating"/, 'Should have activity-detail-rating testid');
});

test('AC2: detail page activity-detail-rating block references activityData.ratingAvg', async () => {
  const src = await readSource('app/activities/[region]/[slug]/page.tsx');
  // The activity-detail-rating block must reference activity-sourced ratingAvg
  assert.match(src, /activity-detail-rating[\s\S]{0,400}activityData\.ratingAvg/, 'activity-detail-rating block must reference activityData.ratingAvg');
});

// AC5: admin edit form
test('AC5: admin edit page has ratingAvg input', async () => {
  const src = await readSource('app/admin/activities/[id]/edit/page.tsx');
  assert.match(src, /ratingAvg/, 'Admin form should have ratingAvg state/input');
});

test('AC5: admin edit page ratingAvg flows into PUT body', async () => {
  const src = await readSource('app/admin/activities/[id]/edit/page.tsx');
  // The JSON.stringify body in handleSave should include ratingAvg
  assert.match(src, /JSON\.stringify\(\{[\s\S]*ratingAvg[\s\S]*\}\)/, 'PUT body should include ratingAvg');
});

test('AC5: admin edit page has reviewCount input', async () => {
  const src = await readSource('app/admin/activities/[id]/edit/page.tsx');
  assert.match(src, /reviewCount/, 'Admin form should have reviewCount state/input');
});
