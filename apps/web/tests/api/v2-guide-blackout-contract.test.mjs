import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readRoute(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('guide blackout collection route contract smoke: list/create + validation envelope', async () => {
  const src = await readRoute('app/api/v2/admin/guides/[guideId]/blackout-dates/route.ts');

  assert.match(src, /export\s+async\s+function\s+GET\s*\(/);
  assert.match(src, /export\s+async\s+function\s+POST\s*\(/);
  assert.match(src, /Invalid guideId/);
  assert.match(src, /Invalid starts_at datetime/);
  assert.match(src, /Invalid ends_at datetime/);
  assert.match(src, /starts_at must be before ends_at/);
  assert.match(src, /errorV2\('NOT_FOUND', 'Guide not found'\)/);
  assert.match(src, /successV2\(\{ blackouts: data \|\| \[\] \}\)/);
  assert.match(src, /successV2\(\{ blackout: data \}\)/);
});

test('guide blackout single-item route contract smoke: delete verifies ownership + returns success envelope', async () => {
  const src = await readRoute(
    'app/api/v2/admin/guides/[guideId]/blackout-dates/[blackoutId]/route.ts'
  );

  assert.match(src, /export\s+async\s+function\s+DELETE\s*\(/);
  assert.match(src, /Invalid guideId/);
  assert.match(src, /Invalid blackoutId/);
  assert.match(src, /Blackout not found/);
  assert.match(src, /\.eq\('guide_id', guideId\)/);
  assert.match(src, /successV2\(\{ deleted: true \}\)/);
});

test('guide availability preview contract smoke: preview includes blackout + booking interaction evidence', async () => {
  const src = await readRoute('app/api/v2/admin/guides/[guideId]/availability-preview/route.ts');

  assert.match(src, /export\s+async\s+function\s+GET\s*\(/);
  assert.match(src, /Preview limited to 14 days/);
  assert.match(src, /Invalid timezone/);
  assert.match(src, /from\('guide_blackout_dates'\)/);
  assert.match(src, /from\('bookings'\)/);
  assert.match(src, /generateAvailableSlots\(input, deps\)/);
  assert.match(src, /blackoutsCount: blackouts\.length/);
  assert.match(src, /activeBookingsCount: bookings\.length/);
  assert.match(src, /slots: result\.slots/);
});

test('booking routes still consult guide blackout dates during draft + available-slots flows', async () => {
  const availableSlots = await readRoute('app/api/v2/activities/[activityId]/available-slots/route.ts');
  const draft = await readRoute('app/api/v2/bookings/draft/route.ts');

  assert.match(availableSlots, /from\('guide_blackout_dates'\)/);
  assert.match(availableSlots, /Failed to fetch blackout dates/);
  assert.match(draft, /from\('guide_blackout_dates'\)/);
  assert.match(draft, /SLOT_UNAVAILABLE/);
});
