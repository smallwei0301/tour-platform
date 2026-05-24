import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('issue621 mobile bottom CTA consumes plan/date-aware href from page contract', async () => {
  const pageSrc = await readSource('app/activities/[region]/[slug]/page.tsx');
  const bottomBarSrc = await readSource('src/components/activity/ActivityBottomBar.tsx');

  assert.match(
    pageSrc,
    /<ActivityBottomBar[\s\S]*directBookingHref=\{directBookingHref\}/,
    'activity page should pass shared directBookingHref into mobile bottom bar'
  );

  assert.match(
    bottomBarSrc,
    /directBookingHref\?:\s*string/,
    'bottom bar props should accept optional directBookingHref for schedule-aware routing'
  );

  assert.match(
    bottomBarSrc,
    /href=\{directBookingHref\s*\?\?\s*resolveBookingEntryHref\(\{\s*activitySlug,\s*useBookingV2\s*\}\)\}/,
    'bottom bar CTA should prefer directBookingHref and only fallback to legacy entry resolver'
  );
});
