/**
 * Contract test: /api/health route static analysis
 * Issue #629 — synthetic health checks before soft launch
 *
 * Reads route.ts source and asserts structural guarantees WITHOUT
 * spinning up a server or touching DB / secrets.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROUTE_PATH = resolve(__dirname, '../../app/api/health/route.ts');

let src;
try {
  src = readFileSync(ROUTE_PATH, 'utf8');
} catch {
  // Let the tests fail with a clear message
  src = '';
}

test('health route file exists and is readable', () => {
  assert.ok(src.length > 0, `route.ts not found or empty at ${ROUTE_PATH}`);
});

test('health route exports GET function', () => {
  assert.match(src, /export\s+(async\s+)?function\s+GET/, 'GET export not found');
});

test('health route has dynamic = force-dynamic', () => {
  assert.match(src, /dynamic\s*=\s*['"]force-dynamic['"]/, 'force-dynamic directive not found');
});

test('health route does NOT import SUPABASE_SERVICE_ROLE_KEY', () => {
  assert.doesNotMatch(
    src,
    /SUPABASE_SERVICE_ROLE_KEY/,
    'health route must not reference SUPABASE_SERVICE_ROLE_KEY — no admin DB access allowed',
  );
});

test('health route does NOT import admin auth modules', () => {
  assert.doesNotMatch(
    src,
    /admin-auth|admin-session|createClient/,
    'health route must not import admin auth or Supabase client',
  );
});

test('health route response includes required keys: ok, status, service, timestamp, version', () => {
  // Check that the response object shape includes all required keys
  const requiredKeys = ['ok', 'status', 'service', 'timestamp', 'version'];
  for (const key of requiredKeys) {
    assert.match(src, new RegExp(`['"]?${key}['"]?\\s*:`), `required key "${key}" not found in response`);
  }
});

test('health route sets service to tour-platform', () => {
  assert.match(src, /tour-platform/, 'service name "tour-platform" not found in route source');
});

test('health route reads version from VERCEL_GIT_COMMIT_SHA or falls back', () => {
  assert.match(
    src,
    /VERCEL_GIT_COMMIT_SHA/,
    'VERCEL_GIT_COMMIT_SHA not used for version — version should reflect deployment commit',
  );
});
