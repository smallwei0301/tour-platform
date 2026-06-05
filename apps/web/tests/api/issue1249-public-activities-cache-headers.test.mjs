// Issue #1249 — public /api/activities was MISS on every traveler load
// because the route emitted no public cache headers. This patch adds
// Cache-Control via a shared helper. These tests pin:
//   - helper returns the expected header tuple
//   - the route imports + applies the helper on the success path
//   - the route does NOT apply public cache headers on the error path
//     (errors must not poison the CDN)
//   - the helper exposes nothing that could leak PII (no user-specific
//     header, no Authorization, etc.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getPublicActivitiesCacheHeaders,
  applyPublicActivitiesCacheHeaders,
} from '../../src/lib/public-cache-headers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ROUTE_PATH = join(REPO_ROOT, 'app/api/activities/route.ts');
const HELPER_PATH = join(REPO_ROOT, 'src/lib/public-cache-headers.mjs');

// ---------- helper unit ----------

test('getPublicActivitiesCacheHeaders returns Cache-Control with public + s-maxage + SWR', () => {
  const h = getPublicActivitiesCacheHeaders();
  assert.equal(typeof h['Cache-Control'], 'string');
  assert.match(h['Cache-Control'], /\bpublic\b/);
  assert.match(h['Cache-Control'], /\bs-maxage=60\b/);
  assert.match(h['Cache-Control'], /\bstale-while-revalidate=300\b/);
});

test('getPublicActivitiesCacheHeaders does NOT include client max-age (browser keeps revalidating)', () => {
  // We rely on the *edge* layer (s-maxage) for cache benefit; per-browser
  // max-age would create stale UX after admin republishes an activity.
  const h = getPublicActivitiesCacheHeaders();
  assert.doesNotMatch(h['Cache-Control'], /(?:^|[,\s])max-age=/);
});

test('getPublicActivitiesCacheHeaders does NOT set any user-specific or auth-related header', () => {
  const h = getPublicActivitiesCacheHeaders();
  // Defensive: a future refactor must not slip an Authorization /
  // Set-Cookie / user-bearing header into a helper that callers apply
  // to a *publicly cached* response.
  for (const name of Object.keys(h)) {
    const lower = name.toLowerCase();
    assert.notEqual(lower, 'authorization');
    assert.notEqual(lower, 'set-cookie');
    assert.notEqual(lower, 'cookie');
    assert.notEqual(lower, 'x-admin-token');
    assert.notEqual(lower, 'x-csrf-token');
  }
});

test('applyPublicActivitiesCacheHeaders applies the headers to a Response and returns it', () => {
  const res = new Response('{}');
  const returned = applyPublicActivitiesCacheHeaders(res);
  assert.equal(returned, res, 'must return the same Response for chaining');
  assert.match(res.headers.get('Cache-Control') ?? '', /\bpublic\b/);
});

// ---------- route source contract ----------

test('Route imports applyPublicActivitiesCacheHeaders', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(
    src,
    /from\s+['"][^'"]*public-cache-headers(\.mjs)?['"]/,
    'route must import the public cache helper',
  );
  assert.match(src, /applyPublicActivitiesCacheHeaders/);
});

test('Route applies cache headers on the success path (after Response.json(ok(...)))', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // Find the success block. The success path is the first
  // Response.json(ok(...)) — make sure the helper is called on it
  // before return.
  const successIdx = src.indexOf('Response.json(ok(');
  assert.ok(successIdx > 0, 'route must still build success envelope via Response.json(ok(...))');
  const successBlock = src.slice(successIdx, successIdx + 500);
  assert.match(successBlock, /applyPublicActivitiesCacheHeaders\(/, 'cache helper must be applied on success path');
});

test('Route does NOT apply public cache headers on the error/500 path', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // Find the failure branch and assert the helper is not called there.
  const failIdx = src.indexOf("fail('SERVER_ERROR'");
  if (failIdx > 0) {
    // ~1.5 lines after the fail() call up to the function end.
    const errorBlock = src.slice(failIdx, failIdx + 400);
    assert.doesNotMatch(
      errorBlock,
      /applyPublicActivitiesCacheHeaders\(/,
      'helper must NOT be applied on the error path — errors should not pollute CDN',
    );
  }
});

// ---------- helper file source contract ----------

test('Helper file has no PII column names and no Authorization references', () => {
  const src = readFileSync(HELPER_PATH, 'utf8');
  assert.doesNotMatch(src, /\bcontact_email\b/);
  assert.doesNotMatch(src, /\btraveler_email\b/);
  assert.doesNotMatch(src, /Authorization/i);
  assert.doesNotMatch(src, /Set-Cookie/i);
});

test('Helper exports both getPublicActivitiesCacheHeaders and applyPublicActivitiesCacheHeaders', () => {
  // Lock the public API so a future refactor cannot accidentally rename
  // one of them and silently break the route source-contract test above.
  const src = readFileSync(HELPER_PATH, 'utf8');
  assert.match(src, /export\s+function\s+getPublicActivitiesCacheHeaders\b/);
  assert.match(src, /export\s+function\s+applyPublicActivitiesCacheHeaders\b/);
});
