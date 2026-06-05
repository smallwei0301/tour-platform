// Lock down the SSR-cacheable posture of /activities/[region]:
//   - No `dynamic = 'force-dynamic'` (it cancels the `revalidate` window).
//   - `revalidate` window is set (page goes through edge cache).
//   - `<ActivitiesContent>` receives `initialActivities` from a server-side
//     `listPublishedActivitiesDb` call, not just `initialRegion`.
//
// Regression history: PR adding `dynamic = 'force-dynamic'` (#973) shipped
// alongside the `revalidate = 60` we wanted, silently neutering the cache.
// We delete force-dynamic and add SSR initial data on top.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE = join(__dirname, '../../app/activities/[region]/page.tsx');

const src = readFileSync(PAGE, 'utf8');

test('region page does NOT set dynamic = "force-dynamic" (would cancel revalidate)', () => {
  assert.doesNotMatch(
    src,
    /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/,
    'force-dynamic on /activities/[region] silently disables CDN cache; remove it',
  );
});

test('region page keeps an explicit revalidate window', () => {
  assert.match(
    src,
    /export\s+const\s+revalidate\s*=\s*\d+/,
    'region page should expose `revalidate = <seconds>` so the SSR HTML is edge-cached',
  );
});

test('region page server-fetches activities for SSR initial data', () => {
  assert.match(
    src,
    /import\s*{[^}]*\blistPublishedActivitiesDb\b/,
    'region page must import listPublishedActivitiesDb so it can pre-populate cards on first paint',
  );
  assert.match(
    src,
    /listPublishedActivitiesDb\(\s*{[\s\S]*?region:\s*entry\.dbValue/,
    'region page must call listPublishedActivitiesDb with the active region.dbValue',
  );
});

test('region page passes initialActivities to ActivitiesContent', () => {
  assert.match(
    src,
    /<ActivitiesContent\b[^>]*\binitialActivities=/,
    'region page should hand initialActivities to ActivitiesContent so first paint has cards',
  );
});
