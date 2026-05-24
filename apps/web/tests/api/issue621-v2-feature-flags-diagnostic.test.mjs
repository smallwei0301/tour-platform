/**
 * Issue #621 Phase 0 — Feature flag diagnostic endpoint contract test.
 * Verifies the /api/v2/feature-flags route exists and exposes the expected shape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ROUTE = 'app/api/v2/feature-flags/route.ts';

test('issue621 phase0: /api/v2/feature-flags route exists', () => {
  assert.equal(existsSync(path.join(ROOT, ROUTE)), true, `Route must exist at ${ROUTE}`);
});

test('issue621 phase0: route is force-dynamic (no static caching)', async () => {
  const src = await readFile(path.join(ROOT, ROUTE), 'utf8');
  assert.match(src, /force-dynamic/, 'route must be force-dynamic to prevent stale flag reads');
});

test('issue621 phase0: route exposes bookingV2 and bookingV2Shell boolean fields', async () => {
  const src = await readFile(path.join(ROOT, ROUTE), 'utf8');
  assert.match(src, /bookingV2:/, 'response must include bookingV2 field');
  assert.match(src, /bookingV2Shell:/, 'response must include bookingV2Shell field');
  assert.match(src, /isBookingV2Enabled/, 'must call isBookingV2Enabled()');
  assert.match(src, /isBookingV2ShellEnabled/, 'must call isBookingV2ShellEnabled()');
});

test('issue621 phase0: route sets Cache-Control no-store', async () => {
  const src = await readFile(path.join(ROOT, ROUTE), 'utf8');
  assert.match(src, /no-store/, 'Cache-Control must be no-store to prevent CDN caching of flag state');
});

test('issue621 phase0: route does not expose secrets or env vars directly', async () => {
  const src = await readFile(path.join(ROOT, ROUTE), 'utf8');
  assert.doesNotMatch(src, /process\.env\.SUPABASE|process\.env\.DATABASE|process\.env\.SECRET/i,
    'diagnostic endpoint must not expose sensitive env vars');
});
