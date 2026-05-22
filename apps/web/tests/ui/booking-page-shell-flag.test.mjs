import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isBookingV2ShellEnabled } from '../../src/config/feature-flags.mjs';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('booking page shell defaults to V2 when NEXT_PUBLIC flag is not set', () => {
  assert.equal(isBookingV2ShellEnabled({}), true);
});

test('booking page shell allows explicit legacy fallback only through NEXT_PUBLIC flag', () => {
  assert.equal(isBookingV2ShellEnabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: '0' }), false);
  assert.equal(isBookingV2ShellEnabled({ NEXT_PUBLIC_BOOKING_V2_ENABLED: 'false' }), false);
});

test('booking page uses deployable shell flag helper instead of runtime-only fallback helper', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');

  assert.match(src, /isBookingV2ShellEnabled\(/);
  assert.doesNotMatch(src, /isBookingV2Enabled\(/);
});
