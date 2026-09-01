import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('canonical guide-bookings route rejects unauthenticated reads and derives ownership from server session', async () => {
  const route = await readFile(path.join(ROOT, 'app/api/v2/guide/bookings/route.ts'), 'utf8');

  assert.match(route, /verifyGuideSession\(req\)/u);
  assert.match(route, /if \(!session\) return Response\.json\(fail\('UNAUTHORIZED', 'session required'\), \{ status: 401 \}\)/u);
  assert.match(route, /\.eq\('guide_id', session\.guideId\)/u);
});

test('canonical guide-bookings list projection deliberately excludes internal fields', async () => {
  const route = await readFile(path.join(ROOT, 'app/api/v2/guide/bookings/route.ts'), 'utf8');

  assert.match(route, /guestPhone: filterScheduleId/u);
  assert.match(route, /maskedEmail: o\.contact_email \? maskEmail/u);
  assert.doesNotMatch(route, /adminNote:/u);
  assert.doesNotMatch(route, /contactEmail:/u);
  assert.doesNotMatch(route, /contactPhone:/u);
});
