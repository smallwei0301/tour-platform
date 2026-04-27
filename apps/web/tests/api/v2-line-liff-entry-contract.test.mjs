import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function read(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('line auth handoff route exists and preserves line source + correlation continuity', async () => {
  const src = await read('app/api/v2/line/auth/handoff/route.ts');

  assert.match(src, /export\s+async\s+function\s+GET\s*\(/);
  assert.match(src, /errorV2\('VALIDATION_ERROR', 'activityId is required'\)/);
  assert.match(src, /bookingParams\.set\('source', 'line'\)/);
  assert.match(src, /bookingParams\.set\('sourceChannel', 'line'\)/);
  assert.match(src, /bookingParams\.set\('correlationId', correlationId\)/);
  assert.match(src, /params\.get\('mode'\) === 'redirect'/);
});

test('booking line wrapper page exists and redirects into handoff path', async () => {
  const src = await read('app/booking/line/page.tsx');

  assert.match(src, /export\s+default\s+async\s+function\s+LineBookingEntryPage/);
  assert.match(src, /handoffParams\.set\('mode', 'redirect'\)/);
  assert.match(src, /redirect\(`\/api\/v2\/line\/auth\/handoff\?\$\{handoffParams\.toString\(\)\}`\)/);
});

test('booking v2 flow forwards correlation header and source channel from line entry', async () => {
  const src = await read('app/booking/[activityId]/page.tsx');

  assert.match(src, /const source = searchParams\.get\('source'\) \|\| searchParams\.get\('sourceChannel'\) \|\| 'web'/);
  assert.match(src, /const correlationId = searchParams\.get\('correlationId'\) \|\| ''/);
  assert.match(src, /const sourceChannel = source === 'line' \? 'line' : 'web'/);
  assert.match(src, /'x-correlation-id': correlationId/);
  assert.match(src, /sourceChannel,/);
});
