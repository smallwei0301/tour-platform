import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..');
const SAMPLE_ACTIVITY_ID = 'c0000003-0000-0000-0000-000000000001';
const INVALID_ACTIVITY_ID = 'c0000003-0000-0000-0000-00000000000g';

function readAppSource(relativePath) {
  return readFileSync(path.resolve(APP_ROOT, relativePath), 'utf8');
}

function readUuidRegex(source, label) {
  const match = source.match(/const UUID_REGEX = (\/[^;]+\/[a-z]*);/i);
  assert.ok(match, `${label} must declare UUID_REGEX`);
  return Function(`return ${match[1]}`)();
}

const collectionRouteSrc = readAppSource('app/api/v2/admin/activities/[activityId]/plans/route.ts');
const itemRouteSrc = readAppSource('app/api/v2/admin/activities/[activityId]/plans/[planId]/route.ts');
const seasonsHelperSrc = readAppSource('src/lib/activity-plan-seasons.ts');
const seasonsCollectionRouteSrc = readAppSource('app/api/v2/admin/activities/[activityId]/plans/[planId]/seasons/route.ts');
const seasonsItemRouteSrc = readAppSource('app/api/v2/admin/activities/[activityId]/plans/[planId]/seasons/[seasonId]/route.ts');
const publicationVersionsRouteSrc = readAppSource('app/api/v2/admin/activities/[activityId]/publication-versions/route.ts');
const restorePublicationRouteSrc = readAppSource('app/api/v2/admin/activities/[activityId]/commands/restore-publication/route.ts');

const validatorSources = [
  ['collection route', collectionRouteSrc],
  ['single-plan route', itemRouteSrc],
  ['seasons helper', seasonsHelperSrc],
];

test('admin plans validators accept structural non-v4 UUIDs and reject non-hex values', () => {
  for (const [label, source] of validatorSources) {
    const uuidRegex = readUuidRegex(source, label);
    assert.equal(uuidRegex.test(SAMPLE_ACTIVITY_ID), true, `${label} must accept the native structural UUID`);
    assert.equal(uuidRegex.test(INVALID_ACTIVITY_ID), false, `${label} must reject non-hex UUIDs`);
  }
});

test('admin plans validators do not retain RFC version or variant nibble restrictions', () => {
  for (const [label, source] of validatorSources) {
    const uuidRegex = readUuidRegex(source, label);
    assert.doesNotMatch(uuidRegex.source, /\[1-5\]\[0-9a-f\]\{3\}/i, `${label} must not restrict UUID versions`);
    assert.doesNotMatch(uuidRegex.source, /\[89ab\]\[0-9a-f\]\{3\}/i, `${label} must not restrict UUID variants`);
  }
});

test('collection GET validates activityId before its first database access', () => {
  const getHandler = collectionRouteSrc.match(/export async function GET\([\s\S]*?(?=\nexport |\ninterface )/);
  assert.ok(getHandler, 'collection GET handler must exist');
  assert.match(getHandler[0], /if \(!UUID_REGEX\.test\(activityId\)\)[\s\S]*?return Response\.json\(errorV2\('VALIDATION_ERROR', 'Invalid activityId'\), \{ status: 400 \}\);[\s\S]*?const supabase = await getSupabase\(\);/);
});

test('single-plan GET validates both IDs before its first database access', () => {
  const getHandler = itemRouteSrc.match(/export async function GET\([\s\S]*?(?=\ninterface )/);
  assert.ok(getHandler, 'single-plan GET handler must exist');
  assert.match(getHandler[0], /if \(!UUID_REGEX\.test\(activityId\)\)[\s\S]*?Invalid activityId[\s\S]*?if \(!UUID_REGEX\.test\(planId\)\)[\s\S]*?Invalid planId[\s\S]*?const supabase = await getSupabase\(\);/);
});

test('single-plan PUT validates both IDs before parsing or database access', () => {
  const putHandler = itemRouteSrc.match(/export async function PUT\([\s\S]*?(?=\nexport async function DELETE)/);
  assert.ok(putHandler, 'single-plan PUT handler must exist');
  assert.match(putHandler[0], /if \(!UUID_REGEX\.test\(activityId\)\)[\s\S]*?Invalid activityId[\s\S]*?if \(!UUID_REGEX\.test\(planId\)\)[\s\S]*?Invalid planId[\s\S]*?let body: UpdatePlanBody;[\s\S]*?const supabase = await getSupabase\(\);/);
});

test('seasons stay on isUuid while publication recovery remains strict', () => {
  assert.match(seasonsCollectionRouteSrc, /\bisUuid\b/);
  assert.match(seasonsItemRouteSrc, /\bisUuid\b/);
  for (const [label, source] of [
    ['publication versions route', publicationVersionsRouteSrc],
    ['restore publication route', restorePublicationRouteSrc],
  ]) {
    assert.match(source, /\[1-5\]\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}/i, `${label} must retain strict UUID policy`);
  }
});
